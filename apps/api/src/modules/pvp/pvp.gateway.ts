import { HttpException, Logger } from '@nestjs/common';
import {
  Ack,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { PvpService } from './pvp.service';
import { PvpSchedulerService } from './pvp-scheduler.service';
import { validateCommand, type PvpCommand } from './pvp.protocol';
import type { Difficulty } from './pvp.policy';
import type { PvpSnapshotDto } from './pvp.dto';

@WebSocketGateway({
  namespace: '/pvp',
  cors: {
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
    credentials: true,
  },
  maxHttpBufferSize: 16_384,
})
export class PvpGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server!: Namespace;
  private readonly logger = new Logger(PvpGateway.name);
  private readonly states = new Map<string, PvpSnapshotDto>();
  constructor(
    private readonly service: PvpService,
    private readonly scheduler: PvpSchedulerService,
  ) {}
  afterInit(server: Namespace) {
    server.use(async (socket, next) => {
      try {
        const header = socket.handshake.auth.authorization;
        if (typeof header !== 'string' || !/^Bearer \S+$/.test(header))
          throw new Error('Bearer required');
        const user = await this.service.student(header);
        socket.data.authorization = header;
        socket.data.studentId = user.id;
        next();
      } catch {
        next(new Error('PVP_AUTH_REQUIRED'));
      }
    });
    this.scheduler.notify = (matchId) => this.broadcast(matchId);
  }
  private envelope(event: string, payload: unknown, requestId: string | null = null) {
    return { event, eventVersion: '1', sentAt: new Date().toISOString(), requestId, payload };
  }
  private async broadcast(matchId: string) {
    for (const socket of this.server.sockets.values()) {
      if (socket.data.matchId !== matchId) continue;
      const state = await this.service.engine.snapshot(String(socket.data.studentId), matchId);
      socket.emit('room:state', this.envelope('room:state', state));
      const previous = this.states.get(socket.id);
      if (previous?.question && previous.question.id !== state.question?.id)
        socket.emit(
          'question:resolved',
          this.envelope('question:resolved', { matchId, questionId: previous.question.id }),
        );
      if (state.status === 'RUNNING' && previous?.status !== 'RUNNING')
        socket.emit('match:started', this.envelope('match:started', state));
      if (state.question && previous?.question?.id !== state.question.id)
        socket.emit('question:started', this.envelope('question:started', state));
      if (state.status === 'CANCELLED' && previous?.status !== state.status)
        socket.emit('match:cancelled', this.envelope('match:cancelled', state));
      if (state.status === 'FINISHED' && previous?.status !== state.status)
        socket.emit(
          state.endReason === 'FORFEIT' ? 'match:forfeited' : 'match:completed',
          this.envelope(
            state.endReason === 'FORFEIT' ? 'match:forfeited' : 'match:completed',
            state,
          ),
        );
      this.states.set(socket.id, state);
    }
  }
  private async command(event: PvpCommand, socket: Socket, input: unknown) {
    let requestId: string | null = null;
    try {
      const message = validateCommand(event, input);
      requestId = message.requestId;
      const user = await this.service.student(String(socket.data.authorization));
      if (user.id !== socket.data.studentId) throw new Error('Identity changed');
      const p = message.payload;
      const engine = this.service.engine;
      let state: PvpSnapshotDto | null = null;
      let response: unknown;
      if (event === 'room:create')
        state = await engine.create(user.id, p.difficulty as Difficulty, requestId);
      if (event === 'room:join') state = await engine.join(user.id, String(p.roomCode));
      if (event === 'player:ready') state = await engine.ready(user.id, String(p.matchId));
      if (event === 'answer:submit')
        state = await engine.answer(
          user.id,
          String(p.matchId),
          String(p.questionId),
          p.optionId as string | null,
          requestId,
        );
      if (event === 'match:reconnect') state = await engine.reconnect(user.id, String(p.matchId));
      if (event === 'room:leave') state = await engine.leave(user.id, String(p.matchId), requestId);
      if (event === 'room:cancel') state = await engine.cancelRoom(user.id, String(p.matchId));
      if (event === 'invitation:send') {
        response = await engine.invite(
          user.id,
          String(p.matchId),
          String(p.recipientStudentId),
          requestId,
        );
        for (const recipient of this.server.sockets.values())
          if (recipient.data.studentId === p.recipientStudentId)
            recipient.emit('invitation:received', this.envelope('invitation:received', response));
      }
      if (event === 'invitation:respond')
        state = await engine.respondInvite(user.id, String(p.inviteId), Boolean(p.accept));
      if (state) {
        const previousMatch = socket.data.matchId as string | undefined;
        if (previousMatch && previousMatch !== state.matchId)
          await engine.disconnect(user.id, previousMatch);
        socket.data.matchId = state.matchId;
        await this.scheduler.schedule(state.matchId, user.id);
        state = await engine.snapshot(user.id, state.matchId);
        await this.broadcast(state.matchId);
      }
      const ack = this.envelope(
        'command:acknowledged',
        { ok: true, state, response: response ?? null },
        requestId,
      );
      if (event === 'answer:submit')
        socket.emit(
          'answer:acknowledged',
          this.envelope('answer:acknowledged', ack.payload, requestId),
        );
      return ack;
    } catch (error) {
      const body = error instanceof HttpException ? error.getResponse() : null;
      const problem =
        body && typeof body === 'object' ? (body as { code?: string; detail?: string }) : null;
      const ack = this.envelope(
        'command:acknowledged',
        {
          ok: false,
          error: {
            status: error instanceof HttpException ? error.getStatus() : 503,
            code: problem?.code ?? 'PVP_UNAVAILABLE',
            detail: problem?.detail ?? 'Permintaan PvP belum berhasil.',
          },
        },
        requestId,
      );
      socket.emit(
        'room:error',
        this.envelope('room:error', (ack.payload as { error: unknown }).error, requestId),
      );
      return ack;
    }
  }
  @SubscribeMessage('room:create') async create(
    @ConnectedSocket() s: Socket,
    @MessageBody() p: unknown,
    @Ack() ack: (value: unknown) => void,
  ) {
    const response = await this.command('room:create', s, p);
    if (typeof ack === 'function') ack(response);
    else s.emit('command:acknowledged', response);
  }
  @SubscribeMessage('room:join') async join(
    @ConnectedSocket() s: Socket,
    @MessageBody() p: unknown,
    @Ack() ack: (value: unknown) => void,
  ) {
    const response = await this.command('room:join', s, p);
    if (typeof ack === 'function') ack(response);
    else s.emit('command:acknowledged', response);
  }
  @SubscribeMessage('player:ready') async ready(
    @ConnectedSocket() s: Socket,
    @MessageBody() p: unknown,
    @Ack() ack: (value: unknown) => void,
  ) {
    const response = await this.command('player:ready', s, p);
    if (typeof ack === 'function') ack(response);
    else s.emit('command:acknowledged', response);
  }
  @SubscribeMessage('answer:submit') async answer(
    @ConnectedSocket() s: Socket,
    @MessageBody() p: unknown,
    @Ack() ack: (value: unknown) => void,
  ) {
    const response = await this.command('answer:submit', s, p);
    if (typeof ack === 'function') ack(response);
    else s.emit('command:acknowledged', response);
  }
  @SubscribeMessage('match:reconnect') async reconnect(
    @ConnectedSocket() s: Socket,
    @MessageBody() p: unknown,
    @Ack() ack: (value: unknown) => void,
  ) {
    const response = await this.command('match:reconnect', s, p);
    if (typeof ack === 'function') ack(response);
    else s.emit('command:acknowledged', response);
  }
  @SubscribeMessage('room:leave') async leave(
    @ConnectedSocket() s: Socket,
    @MessageBody() p: unknown,
    @Ack() ack: (value: unknown) => void,
  ) {
    const response = await this.command('room:leave', s, p);
    if (typeof ack === 'function') ack(response);
    else s.emit('command:acknowledged', response);
  }
  @SubscribeMessage('room:cancel') async cancel(
    @ConnectedSocket() s: Socket,
    @MessageBody() p: unknown,
    @Ack() ack: (value: unknown) => void,
  ) {
    const response = await this.command('room:cancel', s, p);
    if (typeof ack === 'function') ack(response);
    else s.emit('command:acknowledged', response);
  }
  @SubscribeMessage('invitation:send') async invite(
    @ConnectedSocket() s: Socket,
    @MessageBody() p: unknown,
    @Ack() ack: (value: unknown) => void,
  ) {
    const response = await this.command('invitation:send', s, p);
    if (typeof ack === 'function') ack(response);
    else s.emit('command:acknowledged', response);
  }
  @SubscribeMessage('invitation:respond') async respond(
    @ConnectedSocket() s: Socket,
    @MessageBody() p: unknown,
    @Ack() ack: (value: unknown) => void,
  ) {
    const response = await this.command('invitation:respond', s, p);
    if (typeof ack === 'function') ack(response);
    else s.emit('command:acknowledged', response);
  }
  async handleDisconnect(socket: Socket) {
    this.states.delete(socket.id);
    const matchId = socket.data.matchId as string | undefined;
    const studentId = socket.data.studentId as string | undefined;
    if (!matchId || !studentId) return;
    if (
      [...this.server.sockets.values()].some(
        (s) => s.id !== socket.id && s.data.studentId === studentId && s.data.matchId === matchId,
      )
    )
      return;
    try {
      await this.service.engine.disconnect(studentId, matchId);
      await this.scheduler.schedule(matchId, studentId);
      await this.broadcast(matchId);
      for (const peer of this.server.sockets.values())
        if (peer.data.matchId === matchId)
          peer.emit(
            'player:disconnected',
            this.envelope('player:disconnected', { matchId, studentId }),
          );
    } catch {
      this.logger.warn('PvP disconnect could not be persisted.');
    }
  }
}
