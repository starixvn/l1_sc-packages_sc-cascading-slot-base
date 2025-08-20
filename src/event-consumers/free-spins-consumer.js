import Chance from "chance";
import { EventConsumers } from "sc-slot-game-base";
import defaultDefinition from "../board/default-definition";

export default class FreeSpinsConsumer extends EventConsumers.FreeSpinsConsumer {
    constructor(gameId, gameData, freeSpinsRepository, gameNotificationsRepository, idCountersConsumer, roundsRepository) {
        super(gameId, gameData, freeSpinsRepository, gameNotificationsRepository, idCountersConsumer);

        this.roundsRepository = roundsRepository;
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

    async summarizeBuyFreeSpins(player, buyFreeSpinRefRoundId) {
        const buyFreeSpinRounds = await this.roundsRepository
            .find({
                uid: player.UID,
                $or: [{ buyFreeSpinRefRoundId: buyFreeSpinRefRoundId }, { id: buyFreeSpinRefRoundId }],
            })
            .lean()
            .exec();

        const numberOfFreeSpins = Math.max(0, buyFreeSpinRounds.length - 1);

        const totalWin = buyFreeSpinRounds.reduce((sum, round) => {
            return sum + (round.betwin || 0);
        }, 0);

        return {
            numberOfFreeSpins,
            totalWin,
        };
    }

    async reload() {
        const execTime = new Date();
        await this.settleExpiredFreeSpins(execTime);
        const freeSpins = await this.queryFreeSpins(execTime);

        const freeSpinsGroupedByNames = this.groupFreeSpinsByNames(freeSpins);
        const freeSpinsGroupedByUIDs = this.groupFreeSpinsByUIDs(freeSpins);

        await this.cleanUpGameNotifications(freeSpinsGroupedByUIDs);

        Object.entries(this.gameData.ingame).forEach(([name, ingameData]) => {
            const loadedFreeSpins = freeSpinsGroupedByNames[name] ?? [];

            delete ingameData.freeSpins;
            delete freeSpinsGroupedByNames[name];

            ingameData.freeSpins = loadedFreeSpins;
        });

        Object.entries(freeSpinsGroupedByNames).forEach(([name, loadedFreeSpins]) => {
            this.gameData.ingame[name] = this.gameData.ingame[name] ?? { betQueue: [] };
            this.gameData.ingame[name].freeSpins = loadedFreeSpins ?? [];
        });
    }

    async settleExpiredFreeSpins(execTime) {
        const expiredFreeSpins = await this.queryExpiredFreeSpins(execTime);
        const freeSpinsGroupedByUIDs = this.groupFreeSpinsByUIDs(expiredFreeSpins);

        Object.entries(freeSpinsGroupedByUIDs).forEach(async ([uid, loadedFreeSpins]) => {
            const round = await this.roundsRepository.findOne({ id: loadedFreeSpins[0].roundId }).lean().exec();
            const player = {
                UID: uid,
                profile: {
                    name: round.name,
                },
                session: {
                    currencyName: round.currency,
                    operatorId: round.operatorId,
                    siteId: round.siteId,
                    playerId: round.playerId,
                },
            };

            this.gameData.ingame[round.name] = this.gameData.ingame[round.name] ?? { betQueue: [] };
            this.gameData.ingame[round.name].freeSpins = loadedFreeSpins ?? [];
            this.gameData.ingame[round.name].betQueue.push({ player, payload: { freeSpin: true } });
        });
    }

    queryFreeSpins(execTime) {
        const filter = {
            available: { $gt: 0 },
            expiryTime: { $gt: execTime },
        };
        const projection = {
            _id: false,
            playerId: false,
            __v: false,
            __archive: false,
        };

        return this.freeSpinsRepository
            .find(filter, projection, { sort: { expiryTime: 1 } })
            .lean()
            .exec();
    }

    queryExpiredFreeSpins(execTime) {
        const filter = {
            available: { $gt: 0 },
            expiryTime: { $lte: execTime },
        };
        const projection = {
            _id: false,
            playerId: false,
            __v: false,
            __archive: false,
        };

        return this.freeSpinsRepository
            .find(filter, projection, { sort: { expiryTime: 1 } })
            .lean()
            .exec();
    }

    hasFreeSpin(player) {
        const freeSpinsOfPlayer = this.gameData.ingame[player.profile.name]?.freeSpins;

        if (freeSpinsOfPlayer && freeSpinsOfPlayer.length > 0) {
            return freeSpinsOfPlayer.some((freeSpin) => freeSpin.available > 0);
        }

        return false;
    }

    getSoonestExpiredFreeSpinSet(player) {
        const freeSpinsOfPlayer = this.gameData.ingame[player.profile.name]?.freeSpins ?? [];

        return freeSpinsOfPlayer.find((freeSpin) => freeSpin.available > 0);
    }

    getLatestExpiredFreeSpinSet(player) {
        const freeSpinsOfPlayer = this.gameData.ingame[player.profile.name]?.freeSpins ?? [];

        return freeSpinsOfPlayer.reverse().find((freeSpin) => freeSpin.available > 0);
    }
}
