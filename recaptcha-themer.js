(function() {
    // Monkey-patch grecaptcha.render
    function patchRecaptcha() {
        if (window.grecaptcha && window.grecaptcha.render && !window.grecaptcha._ffPatched) {
            const originalRender = window.grecaptcha.render;
            window.grecaptcha.render = function(container, options, inherit) {
                const isDark = document.documentElement.classList.contains('ff-dark');
                if (isDark) {
                    options = options || {};
                    options.theme = 'dark';
                }
                return originalRender.call(this, container, options, inherit);
            };
            window.grecaptcha._ffPatched = true;
        }
    }

    // Watch for grecaptcha object creation
    let _grecaptcha = window.grecaptcha;
    Object.defineProperty(window, 'grecaptcha', {
        get: function() { return _grecaptcha; },
        set: function(val) {
            _grecaptcha = val;
            patchRecaptcha();
        },
        configurable: true
    });
    patchRecaptcha();

    // Safe re-render when theme changes
    window.addEventListener('ff-theme-changed', (e) => {
        const isDark = e.detail.isDark;
        document.querySelectorAll('.g-recaptcha').forEach(el => {
            const targetTheme = isDark ? 'dark' : 'light';
            
            if (window.grecaptcha && window.grecaptcha.render) {
                const sitekey = el.getAttribute('data-sitekey');
                if (sitekey) {
                    try {
                        const newEl = el.cloneNode(false);
                        newEl.setAttribute('data-theme', targetTheme);
                        el.parentNode.replaceChild(newEl, el);
                        
                        window.grecaptcha.render(newEl, {
                            sitekey: sitekey,
                            theme: targetTheme
                        });
                    } catch (err) {
                        console.error('ReFlex: Could not re-render ReCAPTCHA', err);
                    }
                }
            } else {
                el.setAttribute('data-theme', targetTheme);
            }
        });
    });

    // Immediately trigger on load to catch auto-rendered widgets if theme is already dark
    if (document.documentElement.classList.contains('ff-dark')) {
        window.dispatchEvent(new CustomEvent('ff-theme-changed', { detail: { isDark: true } }));
    }
})();
