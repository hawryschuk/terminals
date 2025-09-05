import chai from 'chai';
import { Express } from 'express';
import { MinimalHttpClient } from './MinimalHttpClient';

export const chaiExpressHttpClient = (expressApp: Express) => <MinimalHttpClient>(async ({
    method = 'get' as 'get' | 'post' | 'put' | 'delete',
    url = '' as string,
    body = null as any,
    responseType = 'json' as 'arraybuffer' | 'blob' | 'text' | 'json',
    headers = {} as { [header: string]: string | string[]; }
}) => {
    const x = chai.request(expressApp)[method](`/${url}`)
        .set({ /** 'authorization': app.authenticated?.token || '', */ ...headers })
        .send(body);
    const y = await x
        .then(response => ({ response }))
        .catch(error => ({ error })) as any;
    const { response, error } = y as { response: Awaited<typeof x>; error: any; };
    const { status } = response || {};
    if (error) { console.error(error); throw error; }
    if (status >= 400) {
        const message = response.body?.error || response.body?.message || (response.body ? status : response.text);
        const error = Object.assign(new Error(message), response.body || {}, { status });
        throw error;
    } else {
        return responseType === 'text' ? response.text : response.body;
    }
});
