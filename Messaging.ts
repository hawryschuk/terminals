
export namespace Messaging {

    export namespace User {
        export type Status = {
            type: 'user-status';
            name: string;
            status: 'online' | 'offline' | 'joined-table' | 'left-table' | 'joined-service' | 'left-service' | 'sat-down' | 'stood-up' | 'created-table' | 'ready' | 'unready';
            id?: string;

            seats?: number;
            seat?: number;
            service?: string;
        };

        export type List = {
            type: 'users';
            users: Array<{
                name: string;
                service?: string;
                table?: string;
                seat?: number;
                ready?: boolean;
            }>;
        };
    }

    export namespace Table {
        export type List = {
            type: 'tables';
            tables: Array<{
                id: string;
                service: string;
                seats: Array<string | undefined>;
                standing: string[];
                ready: string[];
            }>;
        };
    }

    export type Chat = {
        type: 'message';
        from: string;
        to: 'everyone' | 'lounge' | 'direct' | 'table';
        id: string;
        message: string;
    };

    export namespace Service {
        export type List = {
            type: 'services',
            services: Array<{ id: string; name: string; }>;
        };

        export type Start = {
            type: 'start-service';
            service: string;
            id: string;
            table: string;
        }

        export type End = {
            type: 'end-service';
            service: string;
            id: string;
            table: string;
            results?: { winners: string[]; losers: string[]; error?: Error; };
        };

        export type Message = {
            type: 'service-message';
            service: string;
            id: string;
            message: any;
        }
    }
}
