// =========================================================
// EXTERMINATORS PEST CONTROL — interactions
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- Sticky nav shadow ---------- */
    const navbar = document.getElementById('navbar');
    const onScroll = () => {
        navbar.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    /* ---------- Mobile nav toggle ---------- */
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    const closeMenu = () => {
        navMenu.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
    };

    navToggle.addEventListener('click', () => {
        const isOpen = navMenu.classList.toggle('is-open');
        navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    navMenu.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', closeMenu);
    });

    /* ---------- Hero CTA scroll ---------- */
    const heroCta = document.getElementById('heroCta');
    if (heroCta) {
        heroCta.addEventListener('click', () => {
            document.getElementById('contact').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
        });
    }

    /* ---------- Scroll reveal ---------- */
    const revealEls = document.querySelectorAll('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) {
        revealEls.forEach((el) => el.classList.add('is-visible'));
    } else {
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

        revealEls.forEach((el) => revealObserver.observe(el));
    }

    /* ---------- Stat counters ---------- */
    const statEls = document.querySelectorAll('.stat-num[data-count]');

    const animateCount = (el) => {
        const target = parseInt(el.dataset.count, 10);
        const suffix = el.dataset.suffix || '';

        if (reduceMotion) {
            el.textContent = target + suffix;
            return;
        }

        const duration = 1200;
        const start = performance.now();

        const tick = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(target * eased) + suffix;
            if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    };

    if ('IntersectionObserver' in window) {
        const statObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    animateCount(entry.target);
                    statObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });

        statEls.forEach((el) => statObserver.observe(el));
    } else {
        statEls.forEach(animateCount);
    }

    const apiBaseUrl = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

    /* ---------- Email status widget ---------- */
    const emailStatusCard = document.getElementById('emailStatus');
    const emailStatusLabel = document.getElementById('emailStatusLabel');
    const emailStatusDetail = document.getElementById('emailStatusDetail');

    if (emailStatusCard) {
        fetch(`${apiBaseUrl}/api/email-status`)
            .then((response) => response.json())
            .then((result) => {
                const ok = result.ok === true;
                emailStatusCard.classList.toggle('ok', ok);
                emailStatusCard.classList.toggle('error', !ok);
                emailStatusLabel.textContent = ok ? 'SMTP is configured and ready.' : 'SMTP configuration problem detected.';
                emailStatusDetail.textContent = result.message || 'Unable to verify email setup.';
            })
            .catch((error) => {
                console.error('Email status fetch error:', error);
                emailStatusCard.classList.add('error');
                emailStatusLabel.textContent = 'Unable to check email status.';
                emailStatusDetail.textContent = 'The server could not be reached. Refresh or try again later.';
            });
    }

    /* ---------- Contact form ---------- */
    const form = document.getElementById('pestForm');
    const formMessage = document.getElementById('formMessage');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!form.checkValidity()) {
                formMessage.textContent = 'Please fill in all required fields.';
                formMessage.className = 'form-message error';
                return;
            }

            formMessage.textContent = 'Sending your request...';
            formMessage.className = 'form-message';

            const formData = new FormData(form);
            const body = {};

            for (const [key, value] of formData.entries()) {
                if (key === 'products') {
                    body.products = body.products || [];
                    body.products.push(value);
                } else {
                    body[key] = value;
                }
            }

            try {
                const response = await fetch(`${apiBaseUrl}/api/submit-quote`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    formMessage.textContent = result.message || 'Request received. We’ll be in touch within 24 hours.';
                    formMessage.className = 'form-message success';
                    form.reset();
                } else {
                    formMessage.textContent = result.message || 'Unable to send request. Please try again later.';
                    formMessage.className = 'form-message error';
                }
            } catch (error) {
                console.error('Submit error:', error);
                formMessage.textContent = 'Unable to send request. Please check your network connection and try again.';
                formMessage.className = 'form-message error';
            }
        });
    }
});