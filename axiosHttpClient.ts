import axios from 'axios';
import { Util } from '@hawryschuk-common/util';
import { MinimalHttpClient } from './MinimalHttpClient';

export const axiosHttpClient = (baseURL: string) => <MinimalHttpClient>(async ({
    method = 'get',
    url = '',
    body = null as any,
    responseType = 'json' as 'arraybuffer' | 'blob' | 'text' | 'json',
    headers = {} as { [header: string]: string | string[]; }
}) => {
    // console.log({ method, url, body, responseType, headers })
    const { success, error }: any = await axios({
        baseURL,
        method,
        url,
        data: body,
        headers
    })
        .then(success => ({ success }))
        .catch(error => ({ error }));
    debugger;
    if (success?.status >= 400) {
        debugger;
        // throw new Error(Util.safeStringify(response.data?.error || response.data));
    } else if (error) {
        debugger;
    } else
        return success.data;
});