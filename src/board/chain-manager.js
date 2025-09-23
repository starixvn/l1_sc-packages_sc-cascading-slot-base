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
     * Calculate normalized base bet amount with floating point precision fix
     * @param {number} betLevel - Bet level
     * @param {number} coinValue - Coin value
     * @returns {number} Normalized base bet amount
     */
    calculateBaseBetAmount(betLevel, coinValue) {
        return Math.round(betLevel * coinValue * 100) / 100;
    }

    /**
     * Generate consistent chain key from player name and bet parameters
     * @param {string} playerName - Player identifier
     * @param {number} betLevel - Bet level
     * @param {number} coinValue - Coin value
     * @returns {string} Normalized chain key
     */
    generateChainKey(playerName, betLevel, coinValue) {
        const baseBetAmount = this.calculateBaseBetAmount(betLevel, coinValue);
        return `${playerName}-${baseBetAmount.toFixed(2)}`;
    }

    /**
     * Check if player already has an active chain
     * @param {string} chainKey - Chain identifier
     * @returns {Object|null} Existing chain or null
     */
    findExistingChain(chainKey) {
        return this.gameData.playerChains[chainKey] || null;
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
            // Limit MongoDB query to reduce payload and only load if we haven't reached the chain limit
            const currentChainCount = this.gameData.availableChains.length;
            if (currentChainCount >= 100) {
                return; // Don't load more chains if we already have 100
            }

            const remainingSlots = 100 - currentChainCount;
            const resultChains = await this.resultChainRepository
                .find({ totalBoardCount: { $lt: 100 } })
                .sort({ _id: -1 }) // Sort by _id descending to get newest chains first
                .limit(remainingSlots)
                .lean()
                .exec();

            for (const chain of resultChains) {
                if (chain.boardsData && chain.boardsData.length > 0) {
                    const existingChain = this.gameData.availableChains.find((existing) => existing.name === chain.name);

                    if (!existingChain) {
                        this.gameData.availableChains.push({
                            name: chain.name,
                            baseBetAmount: chain.baseBetAmount,
                            totalBoardCount: chain.totalBoardCount,
                        });
                    }
                }
            }

            this.logService.log(`[GameID: ${this.gameData.gameConfigs?.gameId}] Loaded ${resultChains.length} chains`);
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

    async getBoardsByChainName(chainName) {
        try {
            this.logService.log(`[GameID: ${this.gameData.gameConfigs?.gameId}] Loading boards for chain ${chainName}`);
            const chain = await this.resultChainRepository.findOne({ name: chainName }).lean().exec();

            return chain?.boardsData || null;
        } catch (error) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] Failed to load boards for chain ${chainName}:`, error);
            return null;
        }
    }

    getNextResult(playerName, playerContext = {}, roundContext = {}) {
        if (!this.isChainEnabled()) {
            return null;
        }

        const { betLevel, coinValue } = playerContext;

        const chainKey = this.generateChainKey(playerName, betLevel, coinValue);
        const playerChain = this.findExistingChain(chainKey);

        if (!playerChain) {
            return null;
        }

        if (playerChain.currentIndex >= playerChain.totalBoards) {
            return null;
        }

        if (!playerChain.boardsLoaded || !playerChain.boards) {
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

        const chainKey = this.generateChainKey(playerName, betLevel, coinValue);
        return !this.findExistingChain(chainKey);
    }

    getChainStatus(playerName, betLevel, coinValue) {
        const chainKey = this.generateChainKey(playerName, betLevel, coinValue);
        const playerChain = this.findExistingChain(chainKey);

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
