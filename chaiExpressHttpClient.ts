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
    const request = chai.request(expressApp)[method](`/${url}`).set({ /** 'authorization': app.authenticated?.token || '', */ ...headers }).send(body);
    const response = await request.catch(error => error.response);
    if (response.status >= 400) {
        const message = response.body?.error || response.body?.message || response.error || response.text;
        throw new Error(message);
    }
    else
        return responseType === 'text' ? response.text : response.body;
});
