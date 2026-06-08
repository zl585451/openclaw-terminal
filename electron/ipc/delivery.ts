import { ipcMain, dialog } from 'electron';
import * as fs from 'fs';
import type { IpcDeps } from './types';

export function registerDeliveryHandlers(_deps: IpcDeps) {
  ipcMain.handle('delivery:exportMarkdown', async (_event, payload: { filename: string; content: string }) => {
    try {
      const result = await dialog.showSaveDialog({
        title: '保存交付包',
        defaultPath: String(payload?.filename || 'delivery.md'),
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'Text', extensions: ['txt'] },
        ],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, error: 'cancelled' };
      }
      await fs.promises.writeFile(result.filePath, String(payload?.content || ''), 'utf8');
      return { success: true, filePath: result.filePath };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `WRITE_FAILED: ${msg}` };
    }
  });

  ipcMain.handle('delivery:exportDocx', async (_event, payload: {
    filename: string;
    documentTitle: string;
    data: any;
  }) => {
    try {
      const result = await dialog.showSaveDialog({
        title: '保存 Word 交付包',
        defaultPath: String(payload?.filename || 'delivery.docx'),
        filters: [
          { name: 'Word', extensions: ['docx'] },
        ],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, error: 'cancelled' };
      }

      const docxModule = await import('docx');
      const {
        AlignmentType,
        BorderStyle,
        Document,
        HeadingLevel,
        Packer,
        Paragraph,
        Table,
        TableCell,
        TableRow,
        TextRun,
        WidthType,
      } = docxModule;
      const sections = Array.isArray(payload?.data?.sections) ? payload.data.sections : [];
      const metadata = Array.isArray(payload?.data?.metadata) ? payload.data.metadata : [];
      const children: any[] = [];

      children.push(new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: String(payload?.documentTitle || '多人演播交付包'), bold: true })],
      }));

      for (const item of metadata) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `${String(item?.label || '')}：`, bold: true }),
            new TextRun(String(item?.value || '')),
          ],
        }));
      }

      children.push(new Paragraph({ text: '' }));

      for (const section of sections) {
        children.push(new Paragraph({
          heading: section.level === 1 ? HeadingLevel.HEADING_1 : section.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          children: [new TextRun(String(section.title || ''))],
        }));

        for (const block of Array.isArray(section.blocks) ? section.blocks : []) {
          if (block.type === 'paragraph') {
            children.push(new Paragraph(String(block.text || '')));
            continue;
          }
          if (block.type === 'scriptLine') {
            children.push(new Paragraph({
              children: [
                new TextRun({ text: `[${String(block.speaker || '旁白')}] `, bold: true }),
                new TextRun(String(block.text || '')),
              ],
            }));
            if (block.note) {
              children.push(new Paragraph({
                children: [new TextRun({ text: `改编说明：${String(block.note)}`, italics: true })],
              }));
            }
            continue;
          }
          if (block.type === 'bullet') {
            for (const item of Array.isArray(block.items) ? block.items : []) {
              children.push(new Paragraph({
                text: String(item || ''),
                bullet: { level: 0 },
              }));
            }
            continue;
          }
          if (block.type === 'table') {
            const rows = [];
            rows.push(new TableRow({
              children: (Array.isArray(block.columns) ? block.columns : []).map((column: string) => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: String(column || ''), bold: true })] })],
              })),
            }));
            for (const row of Array.isArray(block.rows) ? block.rows : []) {
              rows.push(new TableRow({
                children: row.map((cell: string) => new TableCell({
                  children: [new Paragraph(String(cell || ''))],
                })),
              }));
            }
            children.push(new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows,
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: 'D9DDE3' },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D9DDE3' },
                left: { style: BorderStyle.SINGLE, size: 1, color: 'D9DDE3' },
                right: { style: BorderStyle.SINGLE, size: 1, color: 'D9DDE3' },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E6E9EF' },
                insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E6E9EF' },
              },
            }));
          }
        }

        children.push(new Paragraph({ text: '' }));
      }

      const document = new Document({
        sections: [{ properties: {}, children }],
      });
      const buffer = await Packer.toBuffer(document);
      await fs.promises.writeFile(result.filePath, buffer);
      return { success: true, filePath: result.filePath };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `DOCX_WRITE_FAILED: ${msg}` };
    }
  });
}
