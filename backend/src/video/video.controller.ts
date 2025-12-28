import {
  Controller,
  Post,
  Get,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { VideoService } from './video.service';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('video', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedMimes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo'];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Invalid file type. Only video files are allowed.'), false);
        }
      },
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
      },
    }),
  )
  async uploadVideo(@UploadedFile() file: MulterFile) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return await this.videoService.processVideo(file);
  }

  @Post('analyze-url')
  async analyzeFromUrl(@Body() body: { url: string }) {
    if (!body.url) {
      throw new BadRequestException('URL is required');
    }
    return await this.videoService.processVideoFromUrl(body.url);
  }

  @Post('generate-script')
  async generateScript(@Body() body: { topic: string; stylePassport: any }) {
    if (!body.topic || !body.stylePassport) {
      throw new BadRequestException('Topic and stylePassport are required');
    }
    const script = await this.videoService.generateScript(
      body.topic,
      body.stylePassport,
    );
    return { script };
  }
}
