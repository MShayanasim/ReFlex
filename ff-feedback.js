(function() {
    'use strict';

    function initAutoFill() {
        if (!location.href.toLowerCase().includes('feedbackquestions')) return;
        if (document.getElementById('ff-autofill-panel')) return;

        // Find the specific form container for the feedback questions
        const form = document.querySelector('form[action*="SubmitFeedback" i]');
        if (!form) return;
        
        const targetContainer = form.querySelector('.m-portlet__body');
        if (!targetContainer) return;
        
        console.log('ReFlex Auto-Fill: Injecting panel into', targetContainer);

        // Create Panel
        const panel = document.createElement('div');
        panel.id = 'ff-autofill-panel';
        panel.className = 'm-alert m-alert--icon m-alert--outline alert alert-primary fade show';
        panel.style.margin = '0 0 20px 0';
        panel.style.padding = '15px';
        panel.style.borderRadius = '4px';

        panel.innerHTML = `
            <style>
                .ff-btn-purple { background-color: #716aca !important; border-color: #716aca !important; color: white !important; }
                .ff-btn-purple:hover { background-color: #5c55a5 !important; border-color: #5c55a5 !important; }
            </style>
            <div class="m-alert__text" style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center;">
                <strong style="margin-right: 10px; font-size: 1.1rem;">ReFlex Auto-Fill:</strong>
                <button type="button" class="btn btn-sm btn-success m-btn m-btn--custom m-btn--icon" id="ff-btn-strongly-agree">
                    <span><i class="la la-check"></i><span>Strongly Agree</span></span>
                </button>
                <button type="button" class="btn btn-sm btn-info m-btn m-btn--custom m-btn--icon" id="ff-btn-agree">
                    <span><i class="la la-check"></i><span>Agree</span></span>
                </button>
                <button type="button" class="btn btn-sm btn-warning m-btn m-btn--custom m-btn--icon" id="ff-btn-random">
                    <span><i class="la la-magic"></i><span>Random</span></span>
                </button>
                <button type="button" class="btn btn-sm ff-btn-purple m-btn m-btn--custom m-btn--icon" id="ff-btn-disagree">
                    <span><i class="la la-close"></i><span>Disagree</span></span>
                </button>
                <div style="position: relative; display: inline-block;">
                    <button type="button" class="btn btn-sm btn-secondary m-btn" style="position: absolute; top: -24px; right: 0px; padding: 2px 6px; font-size: 0.75rem; line-height: 1; height: auto; z-index: 10;" id="ff-btn-clear">
                        <span><i class="la la-eraser" style="font-size: 0.8rem;"></i> Clear</span>
                    </button>
                    <button type="button" class="btn btn-sm btn-danger m-btn m-btn--custom m-btn--icon" id="ff-btn-strongly-disagree">
                        <span><i class="la la-close"></i><span>Strongly Disagree</span></span>
                    </button>
                </div>
                <button type="button" class="btn btn-sm btn-brand m-btn m-btn--custom" style="margin-left: 10px;" id="ff-btn-submit">
                    <span>Submit</span>
                </button>
            </div>
        `;

        targetContainer.insertBefore(panel, targetContainer.firstChild);

        // Helper to select radios
        function autoFillOption(choiceFunc) {
            const questions = document.querySelectorAll('.m-list-timeline__item');
            
            questions.forEach(q => {
                const radios = q.querySelectorAll('input[type="radio"]');
                if (radios.length === 5) {
                    // We always override any existing selection now!
                    const targetIndex = choiceFunc();
                    if (targetIndex >= 0 && targetIndex < 5) {
                        radios[targetIndex].checked = true;
                        // Optionally trigger change event if page has handlers
                        radios[targetIndex].dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            });
        }

        // Strongly Agree
        document.getElementById('ff-btn-strongly-agree').addEventListener('click', () => {
            autoFillOption(() => 0); // 0th index is Strongly Agree
        });

        // Agree
        document.getElementById('ff-btn-agree').addEventListener('click', () => {
            autoFillOption(() => 1); // 1st index is Agree
        });

        // Disagree
        document.getElementById('ff-btn-disagree').addEventListener('click', () => {
            autoFillOption(() => 3); // 3rd index is Dissatisfied (Disagree)
        });

        // Strongly Disagree
        document.getElementById('ff-btn-strongly-disagree').addEventListener('click', () => {
            autoFillOption(() => 4); // 4th index is Strongly Disagree
        });

        // Random Mix
        document.getElementById('ff-btn-random').addEventListener('click', () => {
            autoFillOption(() => {
                const rand = Math.random();
                if (rand < 0.35) return 0;      // 35% Strongly Agree
                else if (rand < 0.80) return 1; // 45% Agree
                else if (rand < 0.93) return 2; // 13% Uncertain
                else if (rand < 0.99) return 3; // 6% Dissatisfied
                else return 4;                  // 1% Strongly Disagree
            });
        });

        // Clear
        document.getElementById('ff-btn-clear').addEventListener('click', () => {
            const questions = document.querySelectorAll('.m-list-timeline__item');
            questions.forEach(q => {
                const radios = q.querySelectorAll('input[type="radio"]');
                if (radios.length === 5) {
                    radios.forEach(r => { 
                        r.checked = false; 
                        r.dispatchEvent(new Event('change', { bubbles: true }));
                    });
                }
            });
        });

        // Submit
        document.getElementById('ff-btn-submit').addEventListener('click', () => {
            const form = document.querySelector('form[action*="SubmitFeedback" i]');
            if (form) {
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.click();
                else form.submit();
            }
        });
    }

    // Since Flex is an SPA and might render asynchronously, we use a MutationObserver
    // to detect when the user navigates to the page or when the container renders.
    const observer = new MutationObserver(() => {
        initAutoFill();
    });
    
    // Start observing the body for changes
    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }
})();
