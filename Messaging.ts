
export namespace Messaging {
    export type Tables = {
        type: 'tables';
        tables: Array<{
            id: string;
            empty: number;
        }>;
    };
    export type LoungeMessage = {
        type: 'loungeMessage';
        from: string;
        message: string;
    };
    export type ServiceResult = {
        type: 'end-service';
        results: { winners: string[]; losers: string[]; };
    };
}
