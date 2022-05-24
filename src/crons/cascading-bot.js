import { Core } from "sc-game-base";
export default class CascadingBot extends Core.Crons.BaseBot {
    constructor({ definition, gameData, idCountersConsumer }) {
        super(definition, gameData, userInfosRepository);

        this.idCountersConsumer = idCountersConsumer;
    }
    async run() {
        await this.idCountersConsumer.consume("round");
        this.gameData.roundId++;
    }
}
