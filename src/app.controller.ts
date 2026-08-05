import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  getHello(): string {
    return "Sales Management API";
  }

  @Get("/health")
  healthCheck(): {
    status: string;
    message: string;
    timestamp: string;
  } {
    return {
      status: "ok",
      message: "API is healthy",
      timestamp: new Date().toISOString(),
    };
  }
}
