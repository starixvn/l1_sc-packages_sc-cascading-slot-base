import { EventConsumers } from "sc-slot-game-base";

export default class InGameConsumer extends EventConsumers.InGameConsumer {
    constructor({
        definition,
        gameData,
        roundQuery,
        publisher,
        freeSpinsConsumer,
        getBalance,
        userInfosRepository,
        jackpotsRepository,
        totalMultiplierRepository,
    }) {
        super({ definition, gameData, roundQuery, publisher, freeSpinsConsumer, getBalance, userInfosRepository, jackpotsRepository });
        this.totalMultiplierRepository = totalMultiplierRepository;
    }

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
        const freeSpins = { total: totalOfFreeSpins };

        await this.getBalance(realPlayer, true);

        const user = await this.getUserInfo(realPlayer.UID);
        const { exchangeRates } = this.gameData;
        const { session } = realPlayer;
        const rate = exchangeRates.code[session.currencyCode] * session.multiplier;
        const totalMultipliers = (await this.totalMultiplierRepository.findOne({ uid: realPlayer.UID, end: false }).lean().exec()) ?? { rounds: [] };

        return {
            gameConfigs,
            freeSpins,
            totalMultiplier: totalMultipliers.rounds.length ? totalMultipliers.rounds[totalMultipliers.rounds.length - 1].totalMultiplier : 0,
            user: {
                ...user,
                rate,
                multiplier: session.multiplier,
            },
        };
    }
}
