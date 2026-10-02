import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { IdentityModule } from '../identity/identity.module';
import { StudentFeedbackController, TeacherFeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [ClassesModule, IdentityModule],
  controllers: [TeacherFeedbackController, StudentFeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}