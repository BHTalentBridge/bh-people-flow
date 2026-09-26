import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  // ResourcesModule delegates POST /resources/:id/assignments to this service, so
  // there is exactly one code path that creates a placement.
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
