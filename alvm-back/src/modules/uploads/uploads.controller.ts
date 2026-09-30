import { Controller, Delete, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { resolveRequestUser } from '@back/auth/request-auth';
import { sendFetchResponse, toFetchRequest } from '@back/common/fetch-bridge';
import {
  handleChildDocumentUpload,
  handleLogoDelete,
  handleLogoUpload,
  handleStaffDocumentUpload,
} from '@back/http/uploads.handler';

/** Téléversements (multipart) : un `File` ne traverse pas tRPC (TD-025). */
@Controller('upload')
export class UploadsController {
  @Post('logo')
  async logo(@Req() req: Request, @Res() res: Response) {
    await sendFetchResponse(
      res,
      await handleLogoUpload(toFetchRequest(req), await resolveRequestUser(req.headers)),
    );
  }

  @Delete('logo')
  async deleteLogo(@Req() req: Request, @Res() res: Response) {
    await sendFetchResponse(
      res,
      await handleLogoDelete(toFetchRequest(req), await resolveRequestUser(req.headers)),
    );
  }

  @Post('child-documents')
  async childDocument(@Req() req: Request, @Res() res: Response) {
    await sendFetchResponse(
      res,
      await handleChildDocumentUpload(toFetchRequest(req), await resolveRequestUser(req.headers)),
    );
  }

  @Post('staff-documents')
  async staffDocument(@Req() req: Request, @Res() res: Response) {
    await sendFetchResponse(
      res,
      await handleStaffDocumentUpload(toFetchRequest(req), await resolveRequestUser(req.headers)),
    );
  }
}
