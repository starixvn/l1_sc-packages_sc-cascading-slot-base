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
        this.gameData.chainBoardsCache = this.gameData.chainBoardsCache || {};

        // No need to store chainConfigs - access gameConfigs directly when needed
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
     * Check if result chains are enabled from gameConfigs
     * @returns {boolean} - True if chains are enabled
     */
    isChainEnabled() {
        return this.gameData.gameConfigs?.cascadingSlotsConfig?.resultChains?.enabled || false;
    }

    getNumberToLoad(availableChains, appConfigs) {
        const currentChainCount = availableChains.length;
        const { maxChains } = appConfigs?.resultChains || {};

        if (!maxChains) {
            this.logService.logError(`maxChains is not configured in appConfigs.resultChains`);
            return 0;
        }

        if (currentChainCount >= maxChains) {
            return 0;
        }

        return maxChains - currentChainCount;
    }

    /**
     * Load chains from database
     */
    async loadChains() {
        if (!this.isChainEnabled()) {
            return;
        }

        try {
            const remainingSlots = this.getNumberToLoad(this.gameData.availableChains, this.appConfigs);

            // Get valid board counts from assignment configuration
            const { boardRange } = this.appConfigs?.resultChains?.assignment || {};
            const maxValidBoardCount = boardRange && boardRange.length > 0 ? Math.max(...boardRange) : 200;

            const resultChains = await this.resultChainRepository
                .find({ totalBoardCount: { $lte: maxValidBoardCount } })
                .sort({ _id: -1 })
                .limit(remainingSlots)
                .lean()
                .exec();

            for (const chain of resultChains) {
                const existingChain = this.gameData.availableChains.find((c) => c.name === chain.name);
                if (!existingChain) {
                    const chainData = {
                        name: chain.name,
                        baseBetAmount: chain.baseBetAmount,
                        totalBoardCount: chain.totalBoardCount,
                    };

                    this.gameData.availableChains.push(chainData);
                }
            }
        } catch (error) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] Failed to load chains from database:`, error);
        }
    }

    async getBoardsByChainName(chainName) {
        try {
            // Check if boards are already cached
            if (this.gameData.chainBoardsCache[chainName]) {
                return this.gameData.chainBoardsCache[chainName];
            }

            // Load from database and cache
            const chain = await this.resultChainRepository.findOne({ name: chainName }).lean().exec();
            const boardsData = chain?.boardsData || null;

            if (boardsData) {
                this.gameData.chainBoardsCache[chainName] = boardsData;
            }

            return boardsData;
        } catch (error) {
            this.logService.logError(`[GameID: ${this.gameData.gameConfigs?.gameId}] Failed to load boards for chain ${chainName}:`, error);
            return null;
        }
    }

    /**
     * Get or load player chain from memory or database
     * @param {string} playerName - Player identifier
     * @param {number} betLevel - Bet level
     * @param {number} coinValue - Coin value
     * @returns {Promise<Object|null>} Player chain or null
     */
    async getPlayerChain(playerName, betLevel, coinValue) {
        const chainKey = this.generateChainKey(playerName, betLevel, coinValue);
        const existingChain = this.findExistingChain(chainKey);

        if (existingChain) {
            return existingChain;
        }

        return await this.reloadChainFromDatabase(playerName, betLevel, coinValue);
    }

    async getNextResult(playerName, playerContext = {}, roundContext = {}) {
        if (!this.isChainEnabled()) {
            return null;
        }

        const { betLevel, coinValue } = playerContext;

        const playerChain = await this.getPlayerChain(playerName, betLevel, coinValue);
        if (!playerChain) {
            return null;
        }

        if (playerChain.currentIndex >= playerChain.totalBoards) {
            return null;
        }

        // Load boards from shared cache
        const boards = await this.getBoardsByChainName(playerChain.name);
        if (!boards) {
            return null;
        }

        // Update activity timestamp when chain is accessed
        playerChain.lastActivityAt = new Date();

        const currentBoard = boards[playerChain.currentIndex];
        const boardResult = this.convertChainBoardToResult(currentBoard);

        return boardResult;
    }

    /**
     * Reload chain from database when not found in memory
     * @param {string} playerName - Player identifier
     * @param {number} betLevel - Bet level
     * @param {number} coinValue - Coin value
     * @returns {Promise<Object|null>} Reloaded chain or null
     */
    async reloadChainFromDatabase(playerName, betLevel, coinValue) {
        try {
            const activeAssignment = await this.assignmentRepository
                .findOne({
                    playerName,
                    betLevel,
                    coinValue,
                    status: ASSIGNMENT_STATUS.ACTIVE,
                    gameId: this.gameData.gameConfigs.gameId,
                })
                .lean()
                .exec();

            if (!activeAssignment) {
                return null; // No active assignment
            }

            // Create chain entry in memory from database data
            const chainKey = this.generateChainKey(playerName, betLevel, coinValue);
            const playerChain = {
                name: activeAssignment.chainName,
                currentIndex: activeAssignment.currentBoardIndex,
                totalBoards: activeAssignment.totalBoards,
                assignedAt: new Date(activeAssignment.assignedAt),
                lastActivityAt: new Date(activeAssignment.lastActivityAt || activeAssignment.assignedAt),
                betLevel: activeAssignment.betLevel,
                coinValue: activeAssignment.coinValue,
                playerId: activeAssignment.playerId,
                playerName: activeAssignment.playerName,
            };

            this.gameData.playerChains[chainKey] = playerChain;

            return playerChain;
        } catch (error) {
            this.logService.logError(`Failed to reload chain from database: ${error.message}`);
            return null;
        }
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
