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

    async reset() {
        await super.reset();

        const configs = this.gameData.gameConfigs;

        if (configs?.botenabled) {
            const bots = await this.userInfosRepository.find({ type: true, disabled: false }, "id name").lean().exec();

            this.bots = this.chance.shuffle(bots).slice(0, this.maxNumberOfBots);
        } else {
            this.bots = [];
        }
    }
}
