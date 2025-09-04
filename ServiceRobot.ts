import { Prompt } from "./Prompt";
import { ServiceCenterClient } from "./ServiceCenterClient";
import { Terminal } from "./Terminal";
import { Util } from "@hawryschuk-common/util";


export abstract class ServiceRobot {
    constructor(public terminal: Terminal) { this.run(); }
    get client() { return ServiceCenterClient.getInstance(this.terminal); }
    abstract handlePrompts(prompts: Record<string, Prompt[]>): Promise<void>;
    protected async run() {
        await Util.waitUntil(() => this.client.ServiceInstance || this.terminal.finished);
        while (this.client.ServiceInstance && !this.client.ServiceInstance.finished && !this.terminal.finished) {
            if (Util.without(Object.keys(this.terminal.prompts), ['menu']).length)
                await this.handlePrompts(this.terminal.prompts);
            await Util.pause(100);
        }
    }
}
