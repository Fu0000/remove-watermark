export interface ApiResponse<T> {
  code: number;
  message: string;
  requestId: string;
  data: T;
}

export interface Pagination<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
