import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Readable } from 'stream';
import { config } from '../config';

export interface DriveCredentials {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export class GoogleDriveService {
  private createOAuth2Client(credentials?: DriveCredentials): OAuth2Client {
    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    if (credentials) {
      oauth2Client.setCredentials(credentials);
    }

    return oauth2Client;
  }

  /**
   * Generate OAuth2 authorization URL
   */
  getAuthUrl(state?: string): string {
    const oauth2Client = this.createOAuth2Client();
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      prompt: 'consent',
      state,
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokensFromCode(code: string): Promise<DriveCredentials> {
    const oauth2Client = this.createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens as DriveCredentials;
  }

  /**
   * Get user email from credentials
   */
  async getUserEmail(credentials: DriveCredentials): Promise<string> {
    const oauth2Client = this.createOAuth2Client(credentials);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    return data.email || '';
  }

  /**
   * Get Drive instance for an account
   */
  private getDrive(credentials: DriveCredentials): drive_v3.Drive {
    const oauth2Client = this.createOAuth2Client(credentials);
    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Get storage quota for an account
   */
  async getStorageQuota(credentials: DriveCredentials): Promise<{ total: bigint; used: bigint }> {
    const drive = this.getDrive(credentials);
    const { data } = await drive.about.get({
      fields: 'storageQuota',
    });

    const quota = data.storageQuota;
    return {
      total: BigInt(quota?.limit || '0'),
      used: BigInt(quota?.usage || '0'),
    };
  }

  /**
   * Upload a file to Google Drive
   */
  async uploadFile(
    credentials: DriveCredentials,
    fileName: string,
    mimeType: string,
    fileBuffer: Buffer,
    folderId?: string
  ): Promise<{ id: string; size: bigint }> {
    const drive = this.getDrive(credentials);

    const fileMetadata: drive_v3.Schema$File = {
      name: fileName,
      ...(folderId && { parents: [folderId] }),
    };

    const media = {
      mimeType,
      body: Readable.from(fileBuffer),
    };

    const { data } = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, size',
    });

    return {
      id: data.id || '',
      size: BigInt(data.size || '0'),
    };
  }

  /**
   * Download a file from Google Drive (returns stream)
   */
  async downloadFile(credentials: DriveCredentials, fileId: string): Promise<Readable> {
    const drive = this.getDrive(credentials);

    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    return response.data as unknown as Readable;
  }

  /**
   * Delete a file from Google Drive
   */
  async deleteFile(credentials: DriveCredentials, fileId: string): Promise<void> {
    const drive = this.getDrive(credentials);
    await drive.files.delete({ fileId });
  }

  /**
   * List files from Google Drive
   */
  async listFiles(
    credentials: DriveCredentials,
    pageSize: number = 100,
    pageToken?: string,
    query?: string
  ): Promise<{ files: drive_v3.Schema$File[]; nextPageToken?: string }> {
    const drive = this.getDrive(credentials);

    const params: drive_v3.Params$Resource$Files$List = {
      pageSize,
      fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime)',
      ...(pageToken && { pageToken }),
      ...(query && { q: query }),
    };

    const { data } = await drive.files.list(params);

    return {
      files: data.files || [],
      nextPageToken: data.nextPageToken || undefined,
    };
  }

  /**
   * Get file metadata from Google Drive
   */
  async getFileMetadata(credentials: DriveCredentials, fileId: string): Promise<drive_v3.Schema$File> {
    const drive = this.getDrive(credentials);
    const { data } = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size, createdTime, modifiedTime, webContentLink',
    });
    return data;
  }

  /**
   * Refresh credentials if expired
   */
  async refreshCredentials(credentials: DriveCredentials): Promise<DriveCredentials> {
    const oauth2Client = this.createOAuth2Client(credentials);
    const { credentials: newCredentials } = await oauth2Client.refreshAccessToken();
    return {
      ...credentials,
      ...newCredentials,
    } as DriveCredentials;
  }
}

export const googleDriveService = new GoogleDriveService();
