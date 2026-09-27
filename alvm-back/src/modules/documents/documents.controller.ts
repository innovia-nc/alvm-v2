import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { resolveRequestUser } from '@back/auth/request-auth';
import { sendFetchResponse } from '@back/common/fetch-bridge';
import { handleDocumentDownload } from '@back/http/documents.handler';
import {
  handleAttendanceListPdf,
  handleChildProfilePdf,
  handleStaffProfilePdf,
} from '@back/http/generated-pdf.handler';

/** Documents téléchargeables et PDF générés à la demande. */
@Controller()
export class DocumentsController {
  @Get('documents/:kind/:id')
  async download(
    @Req() req: Request,
    @Res() res: Response,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ): Promise<void> {
    await sendFetchResponse(
      res,
      await handleDocumentDownload({ kind, id }, await resolveRequestUser(req.headers)),
    );
  }

  @Get('generate/attendance-list/:campId')
  async attendanceList(@Req() req: Request, @Res() res: Response, @Param('campId') campId: string) {
    await sendFetchResponse(
      res,
      await handleAttendanceListPdf(campId, await resolveRequestUser(req.headers)),
    );
  }

  @Get('generate/child-profile/:childId')
  async childProfile(@Req() req: Request, @Res() res: Response, @Param('childId') childId: string) {
    await sendFetchResponse(
      res,
      await handleChildProfilePdf(childId, await resolveRequestUser(req.headers)),
    );
  }

  @Get('generate/staff-profile/:staffId')
  async staffProfile(@Req() req: Request, @Res() res: Response, @Param('staffId') staffId: string) {
    await sendFetchResponse(
      res,
      await handleStaffProfilePdf(staffId, await resolveRequestUser(req.headers)),
    );
  }
}
