import cron from "cron";
import { Crons } from "sc-slot-game-base";

export default class CascadingGameCron extends Crons.SlotGameCron {
    /**
     * @param {Object} dependencies
     * @param {SlotGameDefinition} dependencies.definition
     * @param {SlotGameData} dependencies.gameData
     * @param {SlotGameBot} dependencies.bot
     * @param {EventConsumers.SettleGameRoundConsumer} dependencies.settleGameRoundConsumer
     * @param {EventConsumers.FreeSpinsConsumer} dependencies.freeSpinsConsumer
     * @param {EventConsumers.IdCountersConsumer} dependencies.idCountersConsumer
     * @param {Core.BaseEventPublishers.GameStatusPublisher} dependencies.gameStatusPublisher
     * @param {Core.BaseEventPublishers.RunningRoundInfoPublisher} dependencies.runningRoundInfoPublisher
     * @param {logger} dependencies.logService
     * @param {mongoose.Model} dependencies.roundsRepository
     * @param {TotalMultiplierConsumer} dependencies.totalMultiplierConsumer
     */
    constructor({
        definition,
        gameData,
        bot,
        settleGameRoundConsumer,
        freeSpinsConsumer,
        idCountersConsumer,
        gameStatusPublisher,
        runningRoundInfoPublisher,
        logService,
        roundsRepository,
        roundIdConsumer,
        gameManagementApiClientFactory,
        totalMultiplierConsumer,
        boardGenerator,
        promotionFreeSpinsConsumer,
    }) {
        super({
            definition,
            gameData,
            bot,
            settleGameRoundConsumer,
            gameStatusPublisher,
            runningRoundInfoPublisher,
            logService,
            roundsRepository,
            freeSpinsConsumer,
            idCountersConsumer,
            roundIdConsumer,
            gameManagementApiClientFactory,
            promotionFreeSpinsConsumer,
        });

        this.totalMultiplierConsumer = totalMultiplierConsumer;
        this.boardGenerator = boardGenerator;
    }

    async start() {
        this.gameData.roundId = await this.idCountersConsumer.getLatestId("round");
        this.gameData.freeSpinId = await this.idCountersConsumer.getLatestId("freespin");

        if (this.gameData.roundId < 1 && this.gameData.freeSpinId < 1) {
            const { roundId, freeSpinId } = await this.getLastArchiveRound();

            await this.idCountersConsumer.updateLatestId("round", roundId);
            await this.idCountersConsumer.updateLatestId("freespin", freeSpinId);

            this.gameData.roundId = roundId;
            this.gameData.freeSpinId = freeSpinId;

            this.logService.logError(
                `${this.definition.name} get roundId #${this.gameData.roundId} and freeSpinId #${this.gameData.freeSpinId} from archive.`
            );
        }

        this.checkPromotionReadiness();
        await this.loadUnsettledBetsToIngame();
        await this.freeSpinsConsumer.reload();
        await this.totalMultiplierConsumer.reload();

        await this.getSettingForNewRound();
        await this.updateExchangeRates();
        this.boardGenerator.initialize();
        this.initTrialMode();

        const job = new cron.CronJob(
            "* * * * * *",
            () => this.proceed().catch(this.logService.logError),
            () => {
                this.logService.logError(
                    `${this.definition.name} unexpectedly stopped at round #${this.gameData.roundId} because some other tasks halt it.`
                );
                job.start();
            }
        );

        job.start();
    }

    async proceed() {
        const { durations } = this.definition;

        if (this.gameData.remainingTime === durations.wholeRound) {
            await this.checkGameStatus();
            this.bot && (await this.bot.reset());
            await this.promotionFreeSpinsConsumer.handlePromotionFreeSpinsExpiry(this.gameData.gameConfigs.gameId);
        }

        if (!this.gameData.disabled) {
            this.gameData.remainingTime--;
            this.bot && (await this.bot.run());
        }

        if (this.gameData.remainingTime < 0) {
            this.gameData.remainingTime = durations.wholeRound;

            await this.freeSpinsConsumer.reload();
            await this.totalMultiplierConsumer.reload();
        }
    }

    async checkGameStatus() {
        await super.checkGameStatus();

        if (!this.gameData.disabled) {
            const { multiplierBonus, mode: difficulty } = this.gameData.gameConfigs.cascadingSlotsConfig;

            this.boardGenerator.updateBoardConfig(difficulty, multiplierBonus.min, multiplierBonus.max);
        }
    }

    initTrialMode() {}
}
