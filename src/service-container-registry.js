import { asClass } from "awilix";
import * as Slot from "sc-slot-game-base";
import { HistoryQuery } from "./query-apis";

export default class ServiceContainerRegistry extends Slot.SlotContainerRegistry {
    registerApis() {
        super.registerApis();

        this.container.register({
            historyQuery: asClass(HistoryQuery).singleton(),
        });
    }
}
