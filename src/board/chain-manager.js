// Status constants
const ASSIGNMENT_STATUS = {
    ACTIVE: "active",
    COMPLETED: "completed",
};

export default class ChainManager {
    /**
     * @param {Object} dependencies - Destructured dependencies for proxy injection
     * @param {SlotGameData} dependencies.gameData
     * @param {logger} dependencies.logService
     * @param {mongoose.Model} dependencies.resultChainRepository
     * @param {mongoose.Model} dependencies.assignmentRepository
     * @param {Object} dependencies.appConfigs
     */
    constructor({ gameData, logService, resultChainRepository, assignmentRepository, appConfigs }) {
        this.gameData = gameData;
        this.logService = logService;
        this.resultChainRepository = resultChainRepository;
        this.assignmentRepository = assignmentRepository;
        this.appConfigs = appConfigs;

        this.gameData.playerChains = this.gameData.playerChains || {};
        this.gameData.availableChains = this.gameData.availableChains || [];

        // Initialize chain configurations from gameConfigs
        const { enabled = false, reload = false } = this.gameData.gameConfigs?.cascadingSlotsConfig?.resultChains || {};
        this.chainConfigs = { enabled, reload };
    }

    /**
     * Update chain configurations from gameConfigs and handle reloading if needed
     * @param {Object} newChainConfigs - Configuration object with enabled and reload properties
     */
    async updateChainConfigs(newChainConfigs) {
        const previousConfigs = { ...this.chainConfigs };
        this.chainConfigs = { ...this.chainConfigs, ...newChainConfigs };

        // Log configuration changes
        if (previousConfigs.enabled !== this.chainConfigs.enabled) {
            this.logService.logError(
                `[GameID: ${this.gameData.gameConfigs?.gameId}] Result chains ${this.chainConfigs.enabled ? "enabled" : "disabled"} via gameConfigs`
            );
        }

        // Handle reload: reload chains if both enabled and reload are true
        if (this.chainConfigs.enabled && this.chainConfigs.reload) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] Reloading result chains due to configuration`);
            await this.reloadChainData();
        }
    }

    /**
     * Check if result chains are enabled from gameConfigs
     * @returns {boolean} - True if chains are enabled
     */
    isChainEnabled() {
        return this.chainConfigs.enabled;
    }

    async loadChainData() {
        if (!this.isChainEnabled()) {
            return;
        }

        try {
            const resultChains = await this.resultChainRepository.find({}).lean().exec();

            for (const chain of resultChains) {
                if (chain.boardsData && chain.boardsData.length > 0) {
                    const existingChain = this.gameData.availableChains.find((existing) => existing.name === chain.name);

                    if (!existingChain) {
                        this.gameData.availableChains.push({
                            name: chain.name,
                            boards: chain.boardsData,
                            baseBetAmount: chain.baseBetAmount,
                            totalBoardCount: chain.totalBoardCount,
                            metadata: {
                                name: chain.name,
                                createdAt: chain.createdAt,
                            },
                        });
                    }
                }
            }

            // Active player chains will be loaded by UserChainConsumer
        } catch (error) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] Failed to load chain data:`, error);
        }
    }

    /**
     * Reload chain data - appends new chains without disrupting active player chains
     */
    async reloadChainData() {
        const previousChainCount = this.gameData.availableChains.length;

        // Load fresh chain data (will append to existing availableChains)
        await this.loadChainData();

        const newChainCount = this.gameData.availableChains.length - previousChainCount;
        this.logService.logError(
            `[GameID: ${this.gameData.gameConfigs?.gameId}] Reloaded chains: ${newChainCount} new chains added, ${this.gameData.availableChains.length} total available`
        );
    }

    async getNextResult(playerName, playerContext = {}, roundContext = {}) {
        if (!this.isChainEnabled()) {
            return null;
        }

        const { betLevel, coinValue } = playerContext;

        const baseBetAmount = betLevel * coinValue;
        const chainKey = `${playerName}-${baseBetAmount}`;
        const playerChain = this.gameData.playerChains[chainKey];

        if (!playerChain) {
            return null;
        }

        if (playerChain.currentIndex >= playerChain.totalBoards) {
            return null;
        }

        const currentBoard = playerChain.boards[playerChain.currentIndex];
        const boardResult = this.convertChainBoardToResult(currentBoard);

        return boardResult;
    }

    convertChainBoardToResult(chainBoard) {
        if (chainBoard.settlementResult && chainBoard.settlementResult.tumbles) {
            const tumbles = chainBoard.settlementResult.tumbles;
            const result = [];

            for (let i = 0; i < tumbles.length; i++) {
                const tumble = tumbles[i];
                const preGeneratedItem = {
                    newBoard: tumble.originalBoard ? tumble.originalBoard.split(",").map((x) => parseInt(x)) : chainBoard.board,
                    multipliers: tumble.multipliers || chainBoard.multipliers || [],
                    explodedSymbols: [],
                    newSymbols: [],
                };

                // Settlement data from current tumble goes to the NEXT preGeneratedResult item
                // This is because cascade data describes what happens AFTER the current tumble
                if (i > 0) {
                    const previousTumble = tumbles[i - 1];
                    preGeneratedItem.explodedSymbols = previousTumble.explodedSymbols || [];
                    preGeneratedItem.newSymbols = previousTumble.newSymbols || [];
                }

                result.push(preGeneratedItem);
            }

            return result;
        }

        return [
            {
                newBoard: chainBoard.board,
                multipliers: chainBoard.multipliers || [],
                explodedSymbols: [],
                newSymbols: [],
            },
        ];
    }

    shouldAssignChain(playerName, betLevel, coinValue) {
        if (!this.isChainEnabled()) {
            return false;
        }

        const baseBetAmount = betLevel * coinValue;
        const chainKey = `${playerName}-${baseBetAmount}`;
        return !this.gameData.playerChains[chainKey];
    }

    getChainStatus(playerName, betLevel, coinValue) {
        const baseBetAmount = betLevel * coinValue;
        const chainKey = `${playerName}-${baseBetAmount}`;
        const playerChain = this.gameData.playerChains[chainKey];

        if (!playerChain) {
            return { hasChain: false };
        }

        return {
            hasChain: true,
            chainName: playerChain.name,
            progress: `${playerChain.currentIndex}/${playerChain.totalBoards}`,
            assignedAt: playerChain.assignedAt,
            betLevel: playerChain.betLevel,
            coinValue: playerChain.coinValue,
        };
    }
}
