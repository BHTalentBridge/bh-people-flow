import { Global, Module } from '@nestjs/common';
import { ServiceProvidersService } from './service-providers.service';
import { ServiceProvidersController } from './service-providers.controller';

@Global()
@Module({
  controllers: [ServiceProvidersController],
  providers: [ServiceProvidersService],
  exports: [ServiceProvidersService],
})
export class ServiceProvidersModule {}
