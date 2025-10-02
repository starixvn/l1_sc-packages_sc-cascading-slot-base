import { Core } from "sc-game-base";
export default class CascadingBot extends Core.Crons.BaseBot {
    constructor({ definition, gameData, idCountersConsumer, gameManagementApiClientFactory }) {
        super(definition, gameData, gameManagementApiClientFactory);

        this.idCountersConsumer = idCountersConsumer;
    }

    async placeBet() {
        this.gameData.roundId = await this.idCountersConsumer.consume("round");
    }
}
