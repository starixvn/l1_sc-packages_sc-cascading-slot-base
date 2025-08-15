import Chance from "chance";
import { EventConsumers } from "sc-slot-game-base";
import defaultDefinition from "../board/default-definition";

export default class FreeSpinsConsumer extends EventConsumers.FreeSpinsConsumer {
    constructor(gameId, gameData, freeSpinsRepository, gameNotificationsRepository, idCountersConsumer) {
        super(gameId, gameData, freeSpinsRepository, gameNotificationsRepository, idCountersConsumer);

        this.chance = new Chance();
        this.buyFreeSpinSymbols = [0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap((symbol) => Array(7).fill(symbol));
    }

    async gainFreeSpin(player, { roundId, totalAmount, betLevel, coinValue, numberOfFreeSpins, buyFreeSpinRefRoundId }, timeToLive) {
        const createdTime = new Date();
        const expiryTime = new Date(createdTime.getTime()).setSeconds(createdTime.getSeconds() + timeToLive);
        const memberName = player.profile.name;

        await this.idCountersConsumer.consume("freespin");
        this.gameData.freeSpinId++;

        const newlyCachedFreeSpin = {
            id: this.gameData.freeSpinId,
            roundId,
            bet: totalAmount,
            total: numberOfFreeSpins,
            available: numberOfFreeSpins,
            time: createdTime,
            expiryTime,
            betLevel,
            coinValue,
            betMultiplier: this.gameData.gameConfigs.cascadingSlotsConfig.betMultiplier,
            buyFreeSpinRefRoundId: buyFreeSpinRefRoundId,
        };

        const gainedFreeSpin = {
            uid: player.UID,
            name: memberName,
            playerId: player.session?.playerId,
            ...newlyCachedFreeSpin,
        };

        const newlyCreatedFreeSpin = await this.freeSpinsRepository.create(gainedFreeSpin);

        if (newlyCreatedFreeSpin) {
            newlyCachedFreeSpin.id = newlyCreatedFreeSpin.id;
            this.gameData.ingame[memberName].freeSpins = this.gameData.ingame[memberName].freeSpins ?? [];

            this.gameData.ingame[memberName].freeSpins.push(newlyCachedFreeSpin);
        }
    }

    async useFreeSpin(player) {
        const firstAvailableFreeSpinSet = this.getSoonestExpiredFreeSpinSet(player);

        if (firstAvailableFreeSpinSet) {
            await this.freeSpinsRepository.updateOne({ id: firstAvailableFreeSpinSet.id }, { $inc: { available: -1 } });
            firstAvailableFreeSpinSet.available--;
        }

        return firstAvailableFreeSpinSet;
    }
    getBuyFreeSpinBoard() {
        return [
            {
                newBoard: this.chance.shuffle(
                    this.chance
                        .pickset(this.buyFreeSpinSymbols, 26)
                        .concat([
                            defaultDefinition.specialSymbols.freeSpins,
                            defaultDefinition.specialSymbols.freeSpins,
                            defaultDefinition.specialSymbols.freeSpins,
                            defaultDefinition.specialSymbols.freeSpins,
                        ])
                ),
                multipliers: [],
            },
        ];
    }

    async summarizeBuyFreeSpins(buyFreeSpinRefRoundId) {
        const buyFreeSpinRounds = await this.roundsRepository
            .find({
                $or: [{ buyFreeSpinRefRoundId: buyFreeSpinRefRoundId }, { id: buyFreeSpinRefRoundId }],
            })
            .lean()
            .exec();

        const numberOfFreeSpins = buyFreeSpinRounds.length - 1;

        const totalWin = buyFreeSpinRounds.reduce((sum, round) => {
            return sum + (round.betwin || 0);
        }, 0);

        return {
            numberOfFreeSpins,
            totalWin,
        };
    }
}
