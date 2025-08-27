
export namespace Messaging {
    export type UserStatus = {
        type: 'user-status';
        name: string;
        status: 'online' | 'offline' | 'joined-table' | 'left-table' | 'joined-service' | 'left-service' | 'sat-down' | 'stood-up' | 'created-table' | 'ready' | 'unready';
        id?: string;

        seats?: number;
        seat?: number;
        service?: string;
    };
    export type Users = {
        type: 'users';
        users: Array<{
            name: string;
            service?: string;
            table?: string;
            seat?:number;
        }>;
    };
    export type Services = {
        type: 'services',
        services: Array<{ id: string; name: string; }>;
    };
    export type Tables = {
        type: 'tables';
        tables: Array<{
            id: string;
            service: string;
            sitting: Array<string | undefined>;
            standing: string[];
            ready: string[];
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
        results?: { winners: string[]; losers: string[]; };
        error?: Error;
    };
}
