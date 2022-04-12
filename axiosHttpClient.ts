import axios from 'axios';

import { MinimalHttpClient } from './MinimalHttpClient';

export const axiosHttpClient = (baseURL: string) => <MinimalHttpClient>(async ({
    method = 'get',
    url = '',
    body = null as any,
    responseType = 'json' as 'arraybuffer' | 'blob' | 'text' | 'json',
    headers = {} as { [header: string]: string | string[]; }
}) => {
    // console.log({ method, url, body, responseType, headers })
    const response: any = await axios({
        baseURL,
        method,
        url,
        data: body,
        headers
    }).catch(error => error.response || error);
    if (response.status >= 400) throw new Error(JSON.stringify(response.data?.error || response.data));
    else return response.data;
});