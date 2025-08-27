
export namespace Messaging {
    export type Tables = {
        type: 'tables';
        tables: Array<{
            id: string;
            empty: number;
        }>;
    };
    export type TableActivity = {
        type: 'table-activity';
        action: 'joined' | 'left' | 'sat' | 'ready' | 'unready';
        who: string;
    };
    export type Message = {
        type: 'message';
        from: string;
        to: 'everyone' | 'lounge' | 'direct' | 'table';
        id: string;
        message: string;
    };
    export type ServiceResult = {
        type: 'end-service';
        results: { winners: string[]; losers: string[]; };
    };
}
