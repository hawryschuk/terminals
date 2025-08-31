import { BaseService } from "./BaseService";

export namespace Messaging {

    export namespace User {
        export type Status = {
            type: 'user-status';
            name: string;
            status: 'online' | 'offline' | 'joined-table' | 'left-table' | 'joined-service' | 'left-service' | 'sat-down' | 'stood-up' | 'created-table' | 'ready' | 'unready' | 'invited-robot' | 'boot-robot';
            id?: string;            // service-id , table-id , seat-id , robot-id

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
                robot?: boolean;
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
        id: string; // * | Servce.Name | User.name | Table.id
        message: string;
    };

    export namespace Service {
        export type List = {
            type: 'services',
            services: Array<{
                id: string;
                name: string;
                seats: typeof BaseService.USERS;
                ALL_SERVICE_MESSAGES_BROADCASTED: boolean;
                CAN_RECONSTRUCT_STATE_FROM_SERVICE_MESSAGES: boolean;
                ROBOT: boolean;
            }>;
        };

        export type Start = {
            type: 'start-service';
            service: string;
            id: string;
            table: string;
            users: string[];
        };

        export type End = {
            type: 'end-service';
            service: string;
            id: string;
            table: string;
            results?: { winners: string[]; losers: string[]; error?: Error; };
        };

        export type Message<T = any> = {
            type: 'service-message';
            service: string;
            id: string;
            message: T;
        }
    }
}
