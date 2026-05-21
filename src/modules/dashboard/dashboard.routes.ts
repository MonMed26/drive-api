import { Router, Request, Response } from 'express';
import path from 'path';
import {
  dashboardAuth,
  validateCredentials,
  generateSessionToken,
  SESSION_COOKIE,
} from '../../middleware/dashboardAuth';

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

function renderLoginPage(res: Response) {
  const pagePath = path.join(viewsDir, 'pages', 'login.ejs');
  const ejs = require('ejs');
  ejs.renderFile(pagePath, {}, (err: any, html: string) => {
    if (err) {
      console.error('Login page render error:', err);
      res.status(500).send('Error rendering login page');
      return;
    }
    res.send(html);
  });
}

// --- Auth routes (no auth required) ---
router.get('/login', (req: Request, res: Response) => {
  // If already logged in, redirect to dashboard
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    const { verifySessionToken } = require('../../middleware/dashboardAuth');
    if (verifySessionToken(token)) {
      res.redirect('/dashboard');
      return;
    }
  }
  renderLoginPage(res);
});

router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  if (!validateCredentials(username, password)) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const token = generateSessionToken();
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
  });

  res.json({ success: true, message: 'Login successful' });
});

router.get('/logout', (req: Request, res: Response) => {
  res.clearCookie(SESSION_COOKIE);
  res.redirect('/dashboard/login');
});

// --- Protected dashboard routes ---
router.use(dashboardAuth);

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
