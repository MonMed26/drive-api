import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

const viewsDir = path.join(__dirname, '..', '..', 'views');

function renderPage(res: Response, page: string, title: string) {
  const layoutPath = path.join(viewsDir, 'layout.ejs');
  const pagePath = path.join(viewsDir, 'pages', `${page}.ejs`);

  const ejs = require('ejs');

  // Render the page content first
  ejs.renderFile(pagePath, {}, (err: any, pageHtml: string) => {
    if (err) {
      console.error('Page render error:', err);
      res.status(500).send('Error rendering page');
      return;
    }

    // Render layout with page content
    ejs.renderFile(layoutPath, { title, page, body: pageHtml }, (err: any, html: string) => {
      if (err) {
        console.error('Layout render error:', err);
        res.status(500).send('Error rendering layout');
        return;
      }
      res.send(html);
    });
  });
}

// Dashboard routes
router.get('/', (req: Request, res: Response) => {
  renderPage(res, 'overview', 'Dashboard');
});

router.get('/accounts', (req: Request, res: Response) => {
  renderPage(res, 'accounts', 'Accounts');
});

router.get('/files', (req: Request, res: Response) => {
  renderPage(res, 'files', 'Files');
});

router.get('/cdn', (req: Request, res: Response) => {
  renderPage(res, 'cdn', 'CDN');
});

router.get('/api-keys', (req: Request, res: Response) => {
  renderPage(res, 'apikeys', 'API Keys');
});

router.get('/docs', (req: Request, res: Response) => {
  renderPage(res, 'docs', 'API Docs');
});

router.get('/file-manager', (req: Request, res: Response) => {
  renderPage(res, 'filemanager', 'File Manager');
});

export default router;
