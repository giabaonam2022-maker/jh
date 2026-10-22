/* ==========================================================================
   SNAKE PRO - GAME LOGIC & MENU CONTROLLER (ha.js)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------------------------
    // 1. CẤU HÌNH & TRẠNG THÁI GAME
    // ----------------------------------------------------------------------
    const CONFIG = {
        GRID_SIZE: 20,
        BASE_SPEED: 110,
        COLORS: {
            HEAD: '#10b981',
            BODY1: '#059669',
            BODY2: '#047857',
            FOOD: '#ef4444',
            OBSTACLE: '#64748b'
        }
    };

    const state = {
        score: 0,
        highScore: localStorage.getItem('snake_high_score') || 0,
        combo: 1,
        gameMode: 'CLASSIC', // Dạng chế độ: CLASSIC, SPEED, SURVIVAL, OBSTACLE
        isRunning: false,
        isPaused: false,
        gameLoop: null,
        timerInterval: null,
        timeElapsed: 0,
        health: 100, // Thanh sinh tồn (Dành riêng cho Survival Mode)
        settings: {
            sound: true,
            wrapWalls: false,
            swipeControl: true
        }
    };

    // Thực thể Rắn, Mồi & Chướng ngại vật
    let snake = [];
    let direction = { x: 1, y: 0 };
    let nextDirection = { x: 1, y: 0 };
    let food = { x: 0, y: 0 };
    let obstacles = [];
    
    // Biến lưu vị trí vuốt màn hình
    let touchStartX = 0, touchStartY = 0;

    // ----------------------------------------------------------------------
    // 2. DOM ELEMENTS
    // ----------------------------------------------------------------------
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const uiCurrentScore = document.getElementById('current-score');
    const uiHighScore = document.getElementById('high-score');
    const uiCombo = document.getElementById('combo-display');
    const uiModeDisplay = document.getElementById('mode-display');
    
    // UI Overlay & Menus
    const overlay = document.getElementById('game-overlay');
    const overlayTitle = document.getElementById('overlay-title');
    const overlaySubtitle = document.getElementById('overlay-subtitle');
    const finalStats = document.getElementById('final-stats');
    const finalScore = document.getElementById('final-score');
    const finalTime = document.getElementById('final-time');

    const mainMenuActions = document.getElementById('main-menu-actions');
    const ingameMenuActions = document.getElementById('ingame-menu-actions');
    const modesModal = document.getElementById('modes-modal');
    const settingsModal = document.getElementById('settings-modal');

    // ----------------------------------------------------------------------
    // 3. WEB AUDIO SYNTHESIZER (Âm thanh không dùng file ngoài)
    // ----------------------------------------------------------------------
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    function playSound(type) {
        if (!state.settings.sound) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === 'eat') {
            osc.frequency.setValueAtTime(300, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
            osc.start(); osc.stop(audioCtx.currentTime + 0.1);
        } else if (type === 'die') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, audioCtx.currentTime);
            osc.frequency.linearRampToValueAtTime(40, audioCtx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            osc.start(); osc.stop(audioCtx.currentTime + 0.3);
        }
    }

    // ----------------------------------------------------------------------
    // 4. KHỞI TẠO GAME & KHUNG HÌNH
    // ----------------------------------------------------------------------
    function init() {
        resizeCanvas();
        uiHighScore.textContent = String(state.highScore).padStart(4, '0');
        setupEvents();
    }

    function resizeCanvas() {
        const size = canvas.parentElement.clientWidth;
        canvas.width = size;
        canvas.height = size;
    }

    window.addEventListener('resize', resizeCanvas);

    // ----------------------------------------------------------------------
    // 5. QUẢN LÝ VÒNG LẶP GAME & CHẾ ĐỘ CHƠI
    // ----------------------------------------------------------------------
    function startGame() {
        // Reset Rắn
        snake = [
            { x: 5, y: 10 },
            { x: 4, y: 10 },
            { x: 3, y: 10 }
        ];
        direction = { x: 1, y: 0 };
        nextDirection = { x: 1, y: 0 };

        // Reset Trạng thái
        state.score = 0;
        state.combo = 1;
        state.timeElapsed = 0;
        state.health = 100;
        state.isRunning = true;
        state.isPaused = false;

        // Tạo chướng ngại vật ngẫu nhiên nếu chọn Chế độ Obstacle
        obstacles = [];
        if (state.gameMode === 'OBSTACLE') {
            for (let i = 0; i < 8; i++) {
                obstacles.push({
                    x: Math.floor(Math.random() * CONFIG.GRID_SIZE),
                    y: Math.floor(Math.random() * CONFIG.GRID_SIZE)
                });
            }
        }

        spawnFood();
        updateUI();

        // Tắt Giao diện Menu Overlay
        overlay.classList.remove('active');
        finalStats.classList.add('hidden');
        mainMenuActions.classList.add('hidden');
        ingameMenuActions.classList.remove('hidden');

        // Khởi động lại Timer
        if (state.gameLoop) clearInterval(state.gameLoop);
        if (state.timerInterval) clearInterval(state.timerInterval);

        let speed = CONFIG.BASE_SPEED;
        if (state.gameMode === 'SPEED') speed = 65; // Tốc độ cực nhanh

        state.gameLoop = setInterval(update, speed);
        state.timerInterval = setInterval(() => {
            if (!state.isPaused) {
                state.timeElapsed++;
                // Giảm máu nếu ở chế độ Sinh Tồn
                if (state.gameMode === 'SURVIVAL') {
                    state.health -= 4;
                    if (state.health <= 0) gameOver();
                }
            }
        }, 1000);
    }

    function update() {
        if (state.isPaused || !state.isRunning) return;

        direction = { ...nextDirection };
        const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

        // Xử lý Xuyên tường
        if (state.settings.wrapWalls) {
            if (head.x < 0) head.x = CONFIG.GRID_SIZE - 1;
            if (head.x >= CONFIG.GRID_SIZE) head.x = 0;
            if (head.y < 0) head.y = CONFIG.GRID_SIZE - 1;
            if (head.y >= CONFIG.GRID_SIZE) head.y = 0;
        } else {
            if (head.x < 0 || head.x >= CONFIG.GRID_SIZE || head.y < 0 || head.y >= CONFIG.GRID_SIZE) {
                return gameOver();
            }
        }

        // Đụng thân rắn
        for (let seg of snake) {
            if (seg.x === head.x && seg.y === head.y) return gameOver();
        }

        // Đụng chướng ngại vật
        if (state.gameMode === 'OBSTACLE') {
            for (let obs of obstacles) {
                if (obs.x === head.x && obs.y === head.y) return gameOver();
            }
        }

        snake.unshift(head);

        // Xử lý Ăn mồi
        if (head.x === food.x && head.y === food.y) {
            state.score += 10 * state.combo;
            playSound('eat');

            if (state.gameMode === 'SURVIVAL') {
                state.health = Math.min(100, state.health + 25); // Nạp thêm máu
            }

            if (state.score > state.highScore) {
                state.highScore = state.score;
                localStorage.setItem('snake_high_score', state.highScore);
            }

            spawnFood();
        } else {
            snake.pop();
        }

        updateUI();
        draw();
    }

    function spawnFood() {
        let valid = false;
        while (!valid) {
            food.x = Math.floor(Math.random() * CONFIG.GRID_SIZE);
            food.y = Math.floor(Math.random() * CONFIG.GRID_SIZE);
            valid = !snake.some(s => s.x === food.x && s.y === food.y) &&
                    !obstacles.some(o => o.x === food.x && o.y === food.y);
        }
    }

    function gameOver() {
        state.isRunning = false;
        clearInterval(state.gameLoop);
        clearInterval(state.timerInterval);
        playSound('die');

        // Bật Menu Game Over
        overlayTitle.textContent = "GAME OVER";
        overlaySubtitle.textContent = "Bạn đã thua cuộc! Hãy thử lại.";
        finalScore.textContent = state.score;
        
        const m = Math.floor(state.timeElapsed / 60).toString().padStart(2, '0');
        const s = (state.timeElapsed % 60).toString().padStart(2, '0');
        finalTime.textContent = `${m}:${s}`;

        finalStats.classList.remove('hidden');
        ingameMenuActions.classList.add('hidden');
        mainMenuActions.classList.remove('hidden');
        overlay.classList.add('active');
    }

    function togglePause() {
        if (!state.isRunning) return;
        state.isPaused = !state.isPaused;

        if (state.isPaused) {
            overlayTitle.textContent = "TẠM DỪNG";
            overlaySubtitle.textContent = "Trò chơi đang dừng lại.";
            finalStats.classList.add('hidden');
            mainMenuActions.classList.add('hidden');
            ingameMenuActions.classList.remove('hidden');
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    }

    // ----------------------------------------------------------------------
    // 6. RENDER HÌNH ẢNH GAME (CANVAS GRAPHICS)
    // ----------------------------------------------------------------------
    function draw() {
        const cellSize = canvas.width / CONFIG.GRID_SIZE;

        // Xóa nền canvas
        ctx.fillStyle = '#0a0e17';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Vẽ Chướng ngại vật (nếu ở chế độ OBSTACLE)
        if (state.gameMode === 'OBSTACLE') {
            ctx.fillStyle = CONFIG.COLORS.OBSTACLE;
            obstacles.forEach(obs => {
                ctx.fillRect(obs.x * cellSize + 1, obs.y * cellSize + 1, cellSize - 2, cellSize - 2);
            });
        }

        // Vẽ Thức ăn
        ctx.fillStyle = CONFIG.COLORS.FOOD;
        ctx.beginPath();
        ctx.arc(food.x * cellSize + cellSize / 2, food.y * cellSize + cellSize / 2, cellSize / 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Vẽ Rắn
        snake.forEach((seg, idx) => {
            ctx.fillStyle = idx === 0 ? CONFIG.COLORS.HEAD : (idx % 2 === 0 ? CONFIG.COLORS.BODY1 : CONFIG.COLORS.BODY2);
            ctx.fillRect(seg.x * cellSize + 1, seg.y * cellSize + 1, cellSize - 2, cellSize - 2);
        });

        // Vẽ Thanh Máu (nếu ở chế độ SURVIVAL)
        if (state.gameMode === 'SURVIVAL') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(10, 10, 100, 8);
            ctx.fillStyle = state.health > 30 ? '#10b981' : '#ef4444';
            ctx.fillRect(10, 10, state.health, 8);
        }
    }

    // ----------------------------------------------------------------------
    // 7. XỬ LÝ ĐIỀU KHIỂN & EVENT LISSENERS
    // ----------------------------------------------------------------------
    function setDir(dir) {
        if (dir === 'UP' && direction.y === 0) nextDirection = { x: 0, y: -1 };
        if (dir === 'DOWN' && direction.y === 0) nextDirection = { x: 0, y: 1 };
        if (dir === 'LEFT' && direction.x === 0) nextDirection = { x: -1, y: 0 };
        if (dir === 'RIGHT' && direction.x === 0) nextDirection = { x: 1, y: 0 };
    }

    function setupEvents() {
        // Phím Bàn Phím PC
        window.addEventListener('keydown', e => {
            switch(e.key) {
                case 'ArrowUp': case 'w': case 'W': setDir('UP'); break;
                case 'ArrowDown': case 's': case 'S': setDir('DOWN'); break;
                case 'ArrowLeft': case 'a': case 'A': setDir('LEFT'); break;
                case 'ArrowRight': case 'd': case 'D': setDir('RIGHT'); break;
                case ' ': togglePause(); break;
            }
        });

        // Phím Ảo D-Pad Mobile
        document.querySelectorAll('.dpad-btn[data-dir]').forEach(btn => {
            btn.addEventListener('click', e => setDir(e.currentTarget.getAttribute('data-dir')));
        });
        document.getElementById('btn-pause-mobile').addEventListener('click', togglePause);

        // Sự kiện các nút bấm Menu
        document.getElementById('btn-play-now').addEventListener('click', startGame);
        document.getElementById('btn-resume').addEventListener('click', togglePause);
        document.getElementById('btn-restart').addEventListener('click', startGame);
        
        document.getElementById('btn-back-main-menu').addEventListener('click', () => {
            state.isRunning = false;
            clearInterval(state.gameLoop);
            clearInterval(state.timerInterval);
            overlayTitle.textContent = "SNAKE PRO";
            overlaySubtitle.textContent = "Hãy chọn chế độ chơi và sẵn sàng!";
            finalStats.classList.add('hidden');
            ingameMenuActions.classList.add('hidden');
            mainMenuActions.classList.remove('hidden');
        });

        document.getElementById('btn-home-logo').addEventListener('click', () => {
            if (state.isRunning) togglePause();
        });

        // Modal Chọn Chế độ chơi
        document.getElementById('btn-open-modes').addEventListener('click', () => modesModal.classList.remove('hidden'));
        document.getElementById('btn-close-modes').addEventListener('click', () => modesModal.classList.add('hidden'));

        document.querySelectorAll('.mode-card').forEach(card => {
            card.addEventListener('click', e => {
                document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
                const target = e.currentTarget;
                target.classList.add('active');
                state.gameMode = target.getAttribute('data-mode');
                
                // Cập nhật tên hiển thị trên thanh Header
                const modeName = target.querySelector('strong').textContent.split(' ')[0];
                uiModeDisplay.textContent = modeName;
            });
        });

        // Modal Cài đặt
        document.getElementById('btn-open-settings').addEventListener('click', () => settingsModal.classList.remove('hidden'));
        document.getElementById('btn-close-settings').addEventListener('click', () => settingsModal.classList.add('hidden'));

        document.getElementById('toggle-sound').addEventListener('change', e => state.settings.sound = e.target.checked);
        document.getElementById('toggle-wall').addEventListener('change', e => state.settings.wrapWalls = e.target.checked);
        document.getElementById('toggle-swipe').addEventListener('change', e => state.settings.swipeControl = e.target.checked);

        // Sự kiện Vuốt màn hình (Swipe Mobile)
        canvas.addEventListener('touchstart', e => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        canvas.addEventListener('touchend', e => {
            if (!state.settings.swipeControl) return;
            const dx = e.changedTouches[0].clientX - touchStartX;
            const dy = e.changedTouches[0].clientY - touchStartY;

            if (Math.abs(dx) > Math.abs(dy)) {
                if (Math.abs(dx) > 30) setDir(dx > 0 ? 'RIGHT' : 'LEFT');
            } else {
                if (Math.abs(dy) > 30) setDir(dy > 0 ? 'DOWN' : 'UP');
            }
        }, { passive: true });
    }

    function updateUI() {
        uiCurrentScore.textContent = String(state.score).padStart(4, '0');
        uiHighScore.textContent = String(state.highScore).padStart(4, '0');
        uiCombo.textContent = `x${state.combo}`;
    }

    // Khởi chạy ứng dụng
    init();
});