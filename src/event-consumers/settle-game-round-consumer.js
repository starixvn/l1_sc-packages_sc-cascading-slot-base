import { round as mathRound } from "mathjs";
import { Core } from "sc-game-base";
import RoundCalculator from "../board/round-calculator";
import FreeSpinsConsumer from "./free-spins-consumer";
import TotalMultiplierConsumer from "./total-multiplier-consumer";

export default class SettleGameRoundConsumer extends Core.BaseEventConsumers.SettleGameRoundConsumer {
    /**
     * @param {Object} dependencies
     * @param {FreeSpinsConsumer} dependencies.freeSpinsConsumer
     * @param {TotalMultiplierConsumer} dependencies.totalMultiplierConsumer
     * @param {RoundCalculator} dependencies.roundCalculator
     */
    constructor({
        definition,
        gameData,
        roundResultPublisher,
        userBetResultPublisher,
        freeSpinsConsumer,
        endGame,
        roundsRepository,
        betsRepository,
        totalMultiplierConsumer,
        roundCalculator,
        gameManagementApiClientFactory,
        resultChainManager,
        userChainConsumer,
    }) {
        super({
            definition,
            gameData,
            roundResultPublisher,
            userBetResultPublisher,
            endGame,
            roundsRepository,
            betsRepository,
            gameManagementApiClientFactory,
        });

        this.freeSpinsConsumer = freeSpinsConsumer;
        this.totalMultiplierConsumer = totalMultiplierConsumer;
        this.roundCalculator = roundCalculator;
        this.chainManager = resultChainManager;
        this.userChainConsumer = userChainConsumer;
    }

    async settleRound(player, roundId) {
        const round = await this.queryRound(roundId);

        if (round) {
            await this.processSpinning(player, round);

            round.paid = true;
            round.endTime = new Date();
            round.sessionId = player.session?.sessionId;

            const betResult = this.calculateBetResult(round);

            await round.save();

            const metaData = this.createMetadata({ bet: round, settlementResult: round.settlementResult, result: round.result });
            await this.callEndGame(round, roundId, round.endTime, betResult, metaData);
            await this.processFreeSpins(player, round);
            await this.userBetResultPublisher.publishToUser(round.uid, this.collectRoundResult(player, round, betResult));

            return { betwin: round.betwin };
        }

        return { betwin: 0 };
    }

    async processSpinning(player, round) {
        const currencyGroupSettings = this.gameData.currencyGroupGames.find((x) => x.groupId.toString() === player.session.currencyGroupId);
        const currentTotalMultiplier = this.totalMultiplierConsumer.getCurrentMultiplier(player);
        const baseBetAmount = round.coinValue * round.betLevel * round.betMultiplier;
        const maxWinPerRound = mathRound(currencyGroupSettings.maxWinPerRound * baseBetAmount, 6);

        const preGeneratedResultInfo = await this.selectPreGeneratedResult(player, round);

        const playerName = player.profile.name;
        round = this.roundCalculator.processSpinning(round, currentTotalMultiplier, maxWinPerRound, preGeneratedResultInfo?.data);

        if (preGeneratedResultInfo?.chainMetadata) {
            round.chainName = preGeneratedResultInfo.chainMetadata.chainName;
            round.boardIndex = preGeneratedResultInfo.chainMetadata.currentBoardIndex;
        }

        if (preGeneratedResultInfo?.isFromChain) {
            try {
                await this.userChainConsumer.updateChainProgress({
                    playerId: player.session?.playerId || player.UID,
                    playerName: playerName,
                    betLevel: round.betLevel,
                    coinValue: round.coinValue,
                    roundBetAmount: round.totalAmount,
                    roundWinAmount: round.betwin || 0,
                    balance: player.balance || 0,
                });
            } catch (error) {
                this.logService.logError(`Failed to update chain progress for ${playerName}`, error);
            }
        }

        if (round.freeSpin && round.betwin > 0 && round.multiplier > 0 && round.settlementResult.tumbles.length > 1) {
            await this.totalMultiplierConsumer.increaseTotalMultiplier(player, { roundId: round.id, multiplier: round.multiplier });
        }

        delete this.gameData.settlementResultFromAdmin[playerName];
    }

    async selectPreGeneratedResult(player, round) {
        const playerName = player.profile.name;
        const buyFreeSpinBoard = round.buyFreeSpin ? this.freeSpinsConsumer.getBuyFreeSpinBoard() : null;
        const adminResult = this.getAdminResult(playerName);
        const chainResultData = await this.getChainResult(player, round, round.freeSpin);

        const chosenResult = this.chooseResult(adminResult, chainResultData, buyFreeSpinBoard);

        return {
            data: chosenResult.result,
            chainMetadata: chosenResult.chainMetadata,
            isFromChain: !adminResult && !buyFreeSpinBoard && !!chainResultData,
            isFromAdmin: !!adminResult,
            isFromBuyFreeSpin: !!buyFreeSpinBoard,
        };
    }

    getAdminResult(playerName) {
        return this.gameData.settlementResultFromAdmin[playerName] || null;
    }

    async getChainResult(player, round, isFreeSpin) {
        const playerName = player.profile.name;

        const chainResultData = await this.chainManager.getNextResult(
            playerName,
            {
                betLevel: round.betLevel,
                coinValue: round.coinValue,
            },
            { isFreeSpin }
        );

        if (!chainResultData) {
            return null;
        }

        return chainResultData;
    }

    chooseResult(adminResult, chainResultData, buyFreeSpinBoard) {
        if (adminResult) {
            return { result: adminResult, chainMetadata: null };
        }

        if (buyFreeSpinBoard) {
            return { result: buyFreeSpinBoard, chainMetadata: null };
        }

        if (chainResultData) {
            return chainResultData;
        }

        return { result: null, chainMetadata: null };
    }

    async processFreeSpins(player, round) {
        const { id, settlementResult, coinValue, betLevel, betMultiplier, buyFreeSpin } = round;

        if (settlementResult.freeSpins?.odds > 0) {
            const buyFreeSpinRefRoundId = buyFreeSpin ? round.id : round.buyFreeSpinRefRoundId;

            await this.freeSpinsConsumer.gainFreeSpin(
                player,
                {
                    roundId: id,
                    totalAmount: coinValue * betLevel * betMultiplier,
                    coinValue,
                    betLevel,
                    betMultiplier,
                    numberOfFreeSpins: settlementResult.freeSpins.odds,
                    buyFreeSpin,
                    buyFreeSpinRefRoundId,
                    xMode: round.xMode,
                },
                this.definition.freeSpinLiveSeconds
            );
        }

        let totalAvailableFreeSpins = this.freeSpinsConsumer.getTotalAvaiableFreeSpins(player);

        if (round.promotionId) {
            totalAvailableFreeSpins += player.promotion?.remainingBonusItems ?? 0;
        }

        if (totalAvailableFreeSpins === 0) {
            await this.totalMultiplierConsumer.stopChain(player);

            if (round.buyFreeSpinRefRoundId) {
                const buyFreeSpinResult = await this.freeSpinsConsumer.summarizeBuyFreeSpins(player, round.buyFreeSpinRefRoundId);

                this.roundResultPublisher.publishToUser(round.uid, { buyFreeSpinResult: { ...buyFreeSpinResult } });
            }
        }
    }

    queryRound(roundId) {
        return this.roundsRepository.findOne({ id: roundId, paid: false }).exec();
    }

    calculateBetResult(round) {
        return {
            totalBetAmount: round.totalAmount,
            totalWin: round.betwin,
            netWin: round.betwin > 0 ? round.betwin - round.totalAmount : 0,
            totalLost: round.totalAmount > round.betwin ? round.totalAmount - round.betwin : 0,
            ...this.determineWinType(round.betwin, round.totalAmount),
        };
    }

    determineWinType(totalWin, totalBetAmount) {
        const { bigWinRatio, megaWinRatio, superWinRatio } = this.gameData.gameConfigs.cascadingSlotsConfig;
        const winRatio = totalWin / totalBetAmount;

        const winTypes = {
            megaWin: megaWinRatio,
            superWin: superWinRatio,
            bigWin: bigWinRatio,
        };

        const achievedWin = Object.keys(winTypes).find((winType) => winRatio >= winTypes[winType]);

        return achievedWin ? { [achievedWin]: true } : {};
    }

    collectRoundResult(player, round, betResult) {
        return {
            finish: {
                roundId: round.id,
                result: round.result,
                win: round.betwin,
                bigWin: betResult.bigWin,
                megaWin: betResult.megaWin,
                superWin: betResult.superWin,
                freeSpins: round.settlementResult.freeSpins.odds,
                totalFreeSpins: this.freeSpinsConsumer.getTotalAvaiableFreeSpins(player),
                tumbles: round.settlementResult.tumbles.map((tumble) => ({
                    icons: tumble.icons,
                    win: tumble.win,
                    result: tumble.newBoard,
                    settlement: {
                        explode: tumble.explodedSymbols,
                        new: tumble.newSymbols,
                    },
                    multipliers: tumble.multipliers,
                })),
                multiplier: round.multiplier,
                totalMultiplier: round.totalMultiplier,
                isFreeSpin: round.freeSpin,
                reachMaxWin: round.reachMaxWin,
                actualBetwin: round.actualBetwin,
            },
        };
    }

    formatEndGameInfo(bet, roundId, time, betResult) {
        const { gameInfo, settlementInfo } = super.formatEndGameInfo(bet, roundId, time, betResult);

        if (bet.freeSpin) {
            settlementInfo.redPlay = 0;
            settlementInfo.baseTotalAmount = 0;
        }

        return { gameInfo, settlementInfo };
    }
}
