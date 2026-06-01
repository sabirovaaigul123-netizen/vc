(() => {
    'use strict';

    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const highScoreEl = document.getElementById('highScore');

    let highScore = 0;
    try {
        highScore = parseInt(localStorage.getItem('flappyDinoHigh') || '0', 10) || 0;
    } catch (e) { /* localStorage недоступен */ }
    highScoreEl.textContent = highScore;

    let audioCtx = null;
    function ensureAudio() {
        if (!audioCtx) {
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) audioCtx = new AC();
            } catch (e) { audioCtx = null; }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
    }

    function playTone(freq, duration, type = 'square', volume = 0.15, slideTo = null, delay = 0) {
        if (!audioCtx) return;
        const startTime = audioCtx.currentTime + delay;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        if (slideTo !== null) {
            osc.frequency.exponentialRampToValueAtTime(slideTo, startTime + duration);
        }
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(volume, startTime + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.02);
    }

    function playNoise(duration, volume = 0.25) {
        if (!audioCtx) return;
        const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        source.connect(gain);
        gain.connect(audioCtx.destination);
        source.start();
    }

    const SFX = {
        flap: () => playTone(620, 0.08, 'square', 0.1, 880),
        score: () => {
            playTone(880, 0.1, 'sine', 0.18, null, 0);
            playTone(1320, 0.15, 'sine', 0.18, null, 0.08);
        },
        hit: () => {
            playNoise(0.18, 0.3);
            playTone(180, 0.18, 'sawtooth', 0.2, 60);
        },
        die: () => playTone(320, 0.6, 'sawtooth', 0.18, 40, 0.1)
    };

    const GRAVITY = 0.45;
    const JUMP = -8.2;
    const PIPE_SPEED = 2.7;
    const PIPE_GAP = 140;
    const PIPE_INTERVAL = 95;
    const GROUND_HEIGHT = 70;

    const dino = {
        x: 90,
        y: H / 2,
        vy: 0,
        rotation: 0,
        wingFrame: 0
    };
    const HIT_W = 14;
    const HIT_H = 12;

    let pipes = [];
    let frame = 0;
    let score = 0;
    let state = 'start';
    let groundOffset = 0;
    let cloudOffset = 0;

    function reset() {
        dino.y = H / 2;
        dino.vy = 0;
        dino.rotation = 0;
        dino.wingFrame = 0;
        pipes = [];
        frame = 0;
        score = 0;
        state = 'start';
    }

    function flap() {
        ensureAudio();
        if (state === 'start') {
            state = 'playing';
            dino.vy = JUMP;
            dino.wingFrame += 1.2;
            SFX.flap();
        } else if (state === 'playing') {
            dino.vy = JUMP;
            dino.wingFrame += 1.2;
            SFX.flap();
        } else if (state === 'gameover') {
            reset();
        }
    }

    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) flap();
    });
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        flap();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.key === ' ') {
            e.preventDefault();
            flap();
        }
    });

    function drawSky() {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#4ec0ca');
        grad.addColorStop(0.6, '#87ceeb');
        grad.addColorStop(1, '#d6f0f5');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    function drawClouds() {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        cloudOffset = (cloudOffset + 0.3) % (W + 200);
        for (let i = 0; i < 4; i++) {
            const baseX = i * 140;
            const cx = ((baseX - cloudOffset + W + 200) % (W + 200)) - 80;
            const cy = 70 + (i % 2) * 50;
            ctx.beginPath();
            ctx.arc(cx, cy, 20, 0, Math.PI * 2);
            ctx.arc(cx + 22, cy - 10, 26, 0, Math.PI * 2);
            ctx.arc(cx + 46, cy, 22, 0, Math.PI * 2);
            ctx.arc(cx + 24, cy + 6, 22, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawSun() {
        const sx = W - 70;
        const sy = 70;
        const grd = ctx.createRadialGradient(sx, sy, 8, sx, sy, 40);
        grd.addColorStop(0, 'rgba(255, 230, 120, 0.9)');
        grd.addColorStop(1, 'rgba(255, 230, 120, 0)');
        ctx.fillStyle = grd;
        ctx.fillRect(sx - 40, sy - 40, 80, 80);
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.arc(sx, sy, 22, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawGround() {
        const groundY = H - GROUND_HEIGHT;
        const grad = ctx.createLinearGradient(0, groundY, 0, H);
        grad.addColorStop(0, '#ded895');
        grad.addColorStop(1, '#b8a75c');
        ctx.fillStyle = grad;
        ctx.fillRect(0, groundY, W, GROUND_HEIGHT);

        ctx.fillStyle = '#a89959';
        groundOffset = (groundOffset + PIPE_SPEED) % 30;
        for (let x = -30 + groundOffset; x < W + 30; x += 30) {
            ctx.fillRect(x, groundY + 8, 14, GROUND_HEIGHT - 8);
        }

        ctx.fillStyle = '#5d8a3a';
        ctx.fillRect(0, groundY, W, 5);

        ctx.fillStyle = '#7bb04f';
        for (let x = -10 + groundOffset * 1.5; x < W + 20; x += 22) {
            ctx.beginPath();
            ctx.moveTo(x, groundY);
            ctx.lineTo(x + 4, groundY - 7);
            ctx.lineTo(x + 8, groundY);
            ctx.closePath();
            ctx.fill();
        }
    }

    function rainbowGradient(x, y, h) {
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0.00, '#ff0040');
        grad.addColorStop(0.16, '#ff7f00');
        grad.addColorStop(0.33, '#ffe600');
        grad.addColorStop(0.50, '#00d96b');
        grad.addColorStop(0.66, '#00aaff');
        grad.addColorStop(0.83, '#8b00ff');
        grad.addColorStop(1.00, '#ff0090');
        return grad;
    }

    function drawPipe(pipe) {
        const capH = 28;
        const capExtra = 7;
        const pw = pipe.width;

        const topH = pipe.gapY;
        ctx.fillStyle = rainbowGradient(pipe.x, 0, topH);
        ctx.fillRect(pipe.x, 0, pw, topH);
        ctx.fillStyle = rainbowGradient(pipe.x - capExtra, topH - capH, capH);
        ctx.fillRect(pipe.x - capExtra, topH - capH, pw + capExtra * 2, capH);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.fillRect(pipe.x + 5, 0, 6, topH);
        ctx.fillRect(pipe.x - capExtra + 5, topH - capH, 6, capH);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.fillRect(pipe.x + pw - 8, 0, 5, topH);
        ctx.fillRect(pipe.x + pw + capExtra - 8, topH - capH, 5, capH);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(pipe.x, 0, pw, topH);
        ctx.strokeRect(pipe.x - capExtra, topH - capH, pw + capExtra * 2, capH);

        const bottomY = pipe.gapY + PIPE_GAP;
        const bottomH = H - GROUND_HEIGHT - bottomY;
        if (bottomH > 0) {
            ctx.fillStyle = rainbowGradient(pipe.x, bottomY, bottomH);
            ctx.fillRect(pipe.x, bottomY, pw, bottomH);
            ctx.fillStyle = rainbowGradient(pipe.x - capExtra, bottomY, capH);
            ctx.fillRect(pipe.x - capExtra, bottomY, pw + capExtra * 2, capH);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
            ctx.fillRect(pipe.x + 5, bottomY, 6, bottomH);
            ctx.fillRect(pipe.x - capExtra + 5, bottomY, 6, capH);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
            ctx.fillRect(pipe.x + pw - 8, bottomY, 5, bottomH);
            ctx.fillRect(pipe.x + pw + capExtra - 8, bottomY, 5, capH);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(pipe.x, bottomY, pw, bottomH);
            ctx.strokeRect(pipe.x - capExtra, bottomY, pw + capExtra * 2, capH);
        }
    }

    function drawDino() {
        ctx.save();
        ctx.translate(dino.x, dino.y);

        const target = Math.max(-0.5, Math.min(1.3, dino.vy / 10));
        dino.rotation += (target - dino.rotation) * 0.18;
        ctx.rotate(dino.rotation);

        dino.wingFrame += 0.28;
        const wingFlap = Math.sin(dino.wingFrame) * 0.7;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.beginPath();
        ctx.ellipse(0, 22, 18, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#4a8a3a';
        ctx.beginPath();
        ctx.moveTo(-16, 0);
        ctx.lineTo(-30, -9);
        ctx.lineTo(-28, 0);
        ctx.lineTo(-30, 9);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#2e5a1e';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#5cb85c';
        ctx.beginPath();
        ctx.ellipse(0, 0, 21, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2e5a1e';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#a8d68a';
        ctx.beginPath();
        ctx.ellipse(2, 5, 15, 8, 0, 0, Math.PI);
        ctx.fill();

        ctx.fillStyle = '#3a6a2a';
        const legOffset = Math.sin(dino.wingFrame * 0.5) * 1.5;
        ctx.fillRect(-9, 11, 5, 9);
        ctx.fillRect(0, 11, 5, 9);
        ctx.fillStyle = '#2e5a1e';
        ctx.fillRect(-11, 18, 9, 3);
        ctx.fillRect(-2, 18, 9, 3);
        ctx.fillStyle = '#3a6a2a';
        ctx.beginPath();
        ctx.moveTo(-9, 18);
        ctx.lineTo(-9 + legOffset, 21);
        ctx.lineTo(-2, 18);
        ctx.closePath();
        ctx.fill();

        ctx.save();
        ctx.translate(-2, -6);
        ctx.rotate(wingFlap - 0.4);
        ctx.fillStyle = '#4a8a3a';
        ctx.beginPath();
        ctx.ellipse(0, -8, 5, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2e5a1e';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.beginPath();
        ctx.ellipse(0, -6, 3, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(2, -6);
        ctx.rotate(wingFlap * 0.85);
        ctx.fillStyle = '#6cc96c';
        ctx.beginPath();
        ctx.ellipse(2, -8, 5, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2e5a1e';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.ellipse(2, -6, 3, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = '#5cb85c';
        ctx.beginPath();
        ctx.ellipse(14, -6, 12, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2e5a1e';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#5cb85c';
        ctx.beginPath();
        ctx.ellipse(22, -1, 7, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(17, -9, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(18, -9, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(18.5, -9.5, 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#2e5a1e';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.lineTo(28, 1);
        ctx.stroke();

        ctx.strokeStyle = '#2e5a1e';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const sx = -14 + i * 5;
            ctx.beginPath();
            ctx.moveTo(sx, -6);
            ctx.lineTo(sx + 3, -8);
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawScore() {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 5;
        ctx.font = 'bold 52px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const s = String(score);
        ctx.strokeText(s, W / 2, 50);
        ctx.fillText(s, W / 2, 50);
    }

    function drawStartScreen() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 38px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FLAPPY DINO', W / 2, H / 2 - 80);
        ctx.font = '20px "Segoe UI", Arial, sans-serif';
        ctx.fillText('ЛКМ или Пробел', W / 2, H / 2 - 30);
        ctx.fillText('чтобы взмахнуть крыльями', W / 2, H / 2 - 5);
        ctx.font = '16px "Segoe UI", Arial, sans-serif';
        ctx.fillText('Пробел — рестарт после проигрыша', W / 2, H / 2 + 30);
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ff5252';
        ctx.font = 'bold 44px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GAME OVER', W / 2, H / 2 - 80);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
        ctx.fillText('Очки: ' + score, W / 2, H / 2 - 25);

        if (score > 0 && score >= highScore) {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
            ctx.fillText('НОВЫЙ РЕКОРД!', W / 2, H / 2 + 10);
        } else {
            ctx.fillStyle = '#fff';
            ctx.font = '20px "Segoe UI", Arial, sans-serif';
            ctx.fillText('Рекорд: ' + highScore, W / 2, H / 2 + 10);
        }

        ctx.fillStyle = '#fff';
        ctx.font = '18px "Segoe UI", Arial, sans-serif';
        const blink = Math.floor(frame / 30) % 2;
        if (blink) {
            ctx.fillText('Нажми Пробел для рестарта', W / 2, H / 2 + 55);
        }
    }

    function die() {
        if (state === 'gameover') return;
        state = 'gameover';
        SFX.hit();
        SFX.die();
        if (score > highScore) {
            highScore = score;
            try { localStorage.setItem('flappyDinoHigh', String(highScore)); } catch (e) {}
            highScoreEl.textContent = highScore;
        }
    }

    function update() {
        if (state === 'start') {
            dino.y = H / 2 + Math.sin(frame * 0.08) * 6;
            frame++;
            return;
        }

        if (state === 'gameover') {
            const groundY = H - GROUND_HEIGHT;
            if (dino.y + 12 < groundY) {
                dino.vy += GRAVITY * 1.5;
                dino.y += dino.vy;
                dino.rotation += 0.08;
            } else {
                dino.y = groundY - 12;
                dino.rotation = Math.PI / 2;
            }
            frame++;
            return;
        }

        dino.vy += GRAVITY;
        dino.y += dino.vy;

        if (frame % PIPE_INTERVAL === 0) {
            const minY = 60;
            const maxY = H - GROUND_HEIGHT - PIPE_GAP - 60;
            const gapY = minY + Math.random() * (maxY - minY);
            pipes.push({
                x: W + 10,
                gapY: gapY,
                width: 60,
                scored: false
            });
        }

        for (let i = pipes.length - 1; i >= 0; i--) {
            const p = pipes[i];
            p.x -= PIPE_SPEED;
            if (!p.scored && p.x + p.width < dino.x) {
                p.scored = true;
                score++;
                SFX.score();
            }
            if (p.x + p.width + 14 < 0) {
                pipes.splice(i, 1);
            }
        }

        const groundY = H - GROUND_HEIGHT;
        if (dino.y + HIT_H >= groundY) {
            dino.y = groundY - HIT_H;
            die();
            return;
        }
        if (dino.y - HIT_H < 0) {
            dino.y = HIT_H;
            dino.vy = 0;
        }

        for (const p of pipes) {
            if (dino.x + HIT_W > p.x - 7 && dino.x - HIT_W < p.x + p.width + 7) {
                if (dino.y - HIT_H < p.gapY || dino.y + HIT_H > p.gapY + PIPE_GAP) {
                    die();
                    return;
                }
            }
        }

        frame++;
    }

    function render() {
        drawSky();
        drawSun();
        drawClouds();
        for (const p of pipes) drawPipe(p);
        drawGround();
        drawDino();
        if (state === 'playing') drawScore();
        if (state === 'start') drawStartScreen();
        if (state === 'gameover') drawGameOver();
    }

    function loop() {
        update();
        render();
        requestAnimationFrame(loop);
    }

    loop();
})();
