import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IrtService } from './irt.service';
import { AdminGuard, type AdminRequest } from '../identity/admin.guard';
import { AdminAccess } from '../identity/admin-permissions';
import { IrtRequestsService } from './irt-requests.service';
import { IrtRequestDto, IrtRequestsDto, PrepareIrtRequestDto } from './irt-requests.dto';
import { ContentPageDto } from '../content/content.dto';

export class AdminIrtItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() batchId!: string;
  @ApiProperty() questionVersionId!: string;
  @ApiProperty() modelVersion!: string;
  @ApiProperty() batchStatus!: string;
  @ApiProperty() sampleSize!: number;
  @ApiProperty() dataStatus!: string;
  @ApiProperty({ type: String, nullable: true }) difficultyB!: string | null;
  @ApiProperty({ type: String, nullable: true }) discriminationA!: string | null;
  @ApiProperty({ type: String, nullable: true }) guessingC!: string | null;
}
export class AdminIrtDto {
  @ApiProperty({ type: [AdminIrtItemDto] }) items!: AdminIrtItemDto[];
}
export class AdminIrtBatchDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) packageId!: string | null;
  @ApiProperty() batchKind!: string;
  @ApiProperty() modelVersion!: string;
  @ApiProperty({ enum: ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'] }) status!: string;
  @ApiProperty() startedAt!: string;
  @ApiProperty({ type: String, nullable: true }) finishedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) resultReleasedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
}
export class AdminIrtBatchesDto {
  @ApiProperty({ type: [AdminIrtBatchDto] }) items!: AdminIrtBatchDto[];
}

// Legacy readers and v3 operational handoff. Scientific configuration/publication remains OPEN-12/18.
@ApiTags('admin-irt')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@AdminAccess('content')
@Controller('admin/irt')
export class IrtController {
  constructor(
    @Inject(IrtService) private readonly irt: IrtService,
    @Inject(IrtRequestsService) private readonly requests: IrtRequestsService,
  ) {}
  @Post('requests')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: IrtRequestDto })
  prepare(
    @Req() request: AdminRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: PrepareIrtRequestDto,
  ) {
    return this.requests.prepare(request.adminId, key ?? '', input);
  }
  @Get('requests')
  @ApiOkResponse({ type: IrtRequestsDto })
  requestList(@Query() page: ContentPageDto) {
    return this.requests.list(page);
  }
  @Get('requests/:id')
  @ApiOkResponse({ type: IrtRequestDto })
  requestDetail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.requests.detail(id);
  }
  @Post('requests/:id/retry')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: IrtRequestDto })
  retry(
    @Req() request: AdminRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.requests.retry(request.adminId, key ?? '', id);
  }
  @Get()
  @ApiOkResponse({ type: AdminIrtDto })
  list(@Query() page: ContentPageDto) {
    return this.irt.list(page);
  }
  @Get('batches')
  @ApiOkResponse({ type: AdminIrtBatchesDto })
  batches(@Query() page: ContentPageDto) {
    return this.irt.batches(page);
  }
}
