import { Table } from "sc-game-base";

export default class UserSignInConsumer extends Table.EventConsumers.TableUserSignInConsumer {
    async consume(socketClient, payload) {
        this.publishGameInfo(socketClient);

        await super.consume(socketClient, payload);
    }
    extendPromo(baseData, originalPromotion) {
        return {
            ...baseData,
            betLevel: this.getDefaultBetLevel(),
            coinValue: originalPromotion.coinValue,
        };
    }
    getDefaultBetLevel() {
        const { cascadingSlotsConfig } = this.gameData.gameConfigs;
        return cascadingSlotsConfig.betLevels[0];
    }

    publishGameInfo(socketClient) {
        const { volatility } = this.gameData?.gameConfigs?.cascadingSlotsConfig ?? {};
        const gameInfo = {
            gameId: this.definition.id,
            volatility,
        };

        socketClient.emit("gameInfo", { gameInfo });
    }
}
