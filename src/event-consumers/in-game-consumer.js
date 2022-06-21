import { EventConsumers } from "sc-slot-game-base";

export default class InGameConsumer extends EventConsumers.InGameConsumer {
    async buildPayload(realPlayer) {
        const settings = this.gameData.currencyGroupGames.find((x) => x.groupId.toString() === realPlayer.session.currencyGroupId);
        const coinValues = settings?.coinValues;
        const maxWinPerRound = settings?.maxWinPerRound;

        const { betLevels, betMultiplier, oddsByCounts, freeSpins: freeSpinsConfig } = this.gameData.gameConfigs.cascadingSlotsConfig;
        const gameConfigs = {
            coinValues,
            maxWinPerRound,
            betLevels,
            betMultiplier,
            odds: { symbols: oddsByCounts, freeSpins: freeSpinsConfig },
        };

        const totalOfFreeSpins = this.freeSpinsConsumer.getTotalAvaiableFreeSpins(realPlayer);
        const soonestExpiredFreeSpin = this.freeSpinsConsumer.getSoonestExpiredFreeSpinSet(realPlayer);

        const freeSpins = {
            total: totalOfFreeSpins,
            betLevel: soonestExpiredFreeSpin?.betLevel,
            coinValue: soonestExpiredFreeSpin?.coinValue,
        };

        await this.getBalance(realPlayer, true);

        const user = await this.getUserInfo(realPlayer.UID);
        const { exchangeRates } = this.gameData;
        const { session } = realPlayer;
        const rate = exchangeRates.code[session.currencyCode] * session.multiplier;

        return {
            gameConfigs,
            freeSpins,
            totalMultiplier: this.gameData.ingame[realPlayer.profile.name]?.totalMultiplier ?? 0,
            user: {
                ...user,
                rate,
                multiplier: session.multiplier,
            },
        };
    }
}
