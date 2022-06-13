import { Core } from "sc-game-base";
export default class CascadingBot extends Core.Crons.BaseBot {
    constructor({ definition, gameData, idCountersConsumer, userInfosRepository }) {
        super(definition, gameData, userInfosRepository);

        this.idCountersConsumer = idCountersConsumer;
    }

    async placeBet() {
        await this.idCountersConsumer.consume("round");
        this.gameData.roundId++;
    }
}
