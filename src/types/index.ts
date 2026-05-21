export interface StorageInfo {
  totalStorage: bigint;
  usedStorage: bigint;
  freeStorage: bigint;
  accountCount: number;
}

export interface AccountStorageInfo {
  id: string;
  email: string;
  totalStorage: bigint;
  usedStorage: bigint;
  freeStorage: bigint;
  isActive: boolean;
}

export interface SignedUrlPayload {
  fileId: string;
  exp: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface FileSearchQuery extends PaginationQuery {
  q?: string;
  mimeType?: string;
  path?: string;
}

export interface UploadResult {
  id: string;
  driveFileId: string;
  accountId: string;
  name: string;
  mimeType: string;
  size: bigint;
  path: string;
}
