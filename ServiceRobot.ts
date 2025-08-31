import { Prompt } from "./Prompt";
import { ServiceCenterClient } from "./ServiceCenterClient";
import { Terminal } from "./Terminal";
import { Util } from "@hawryschuk-common/util";


export abstract class ServiceRobot {
    constructor(public terminal: Terminal) { this.run(); }
    get client() { return ServiceCenterClient.getInstance(this.terminal); }
    abstract handlePrompts(prompts: Record<string, Prompt[]>): Promise<void>;
    protected async run() {
        await Util.waitUntil(() => this.client.ServiceInstance);
        while (this.client.ServiceInstance && !this.client.ServiceInstance.finished) {
            const { prompts: promptss = {} } = this.terminal;
            delete promptss.menu;
            if (Object.entries(promptss).length)
                await this.handlePrompts(promptss);
            await Util.pause(100);
        }
    }
}
