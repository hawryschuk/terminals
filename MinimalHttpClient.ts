
export type MinimalHttpClient = (requestParams: {
    method?: 'post' | 'get' | 'delete' | 'put';
    url: string;
    body?: any;
    responseType?: 'arraybuffer' | 'blob' | 'text' | 'json';
    headers?: { [header: string]: string | string[]; };
}) => Promise<any>;
