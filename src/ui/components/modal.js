// src/ui/components/modal.js (исправленный)
window.App = window.App || {};
App.ui = App.ui || {};

App.ui.createModal = function(title, content) {
    if (App.ui.currentModal) {
        App.ui.currentModal.remove();
        document.body.style.overflow = '';
        App.ui.currentModal = null;
    }

    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';

    var innerHtml =
        '<div class="modal-content">' +
            '<span class="close">&times;</span>' +
            '<h3 style="margin-top:0; margin-bottom:16px;">' + App.utils.escapeHtml(title) + '</h3>' +
            content +
        '</div>';

    modal.innerHTML = innerHtml;
    document.body.appendChild(modal);

    document.body.style.overflow = 'hidden';

    var origRemove = modal.remove;
    modal.remove = function() {
        document.body.style.overflow = '';
        if (App.ui.currentModal === modal) {
            App.ui.currentModal = null;
        }
        origRemove.call(this);
    };

    var closeBtn = modal.querySelector('.close');
    if (closeBtn) {
        closeBtn.onclick = function() {
            modal.remove();
        };
    }

    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });

    function escapeHandler(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    }
    document.addEventListener('keydown', escapeHandler);

    App.ui.currentModal = modal;
    if (typeof App.initIcons === 'function') App.initIcons();

    if (window.visualViewport && window.innerWidth < 768) {
        var contentEl = modal.querySelector('.modal-content');
        function adjustForKeyboard() {
            if (!modal.parentNode) return;
            var viewport = window.visualViewport;
            var bottomOffset = window.innerHeight - (viewport.height + viewport.offsetTop);
            if (bottomOffset > 0) {
                contentEl.style.transform = 'translateY(-' + bottomOffset + 'px)';
            } else {
                contentEl.style.transform = 'translateY(0)';
            }
        }
        window.visualViewport.addEventListener('resize', adjustForKeyboard);
        window.visualViewport.addEventListener('scroll', adjustForKeyboard);
        var observer = new MutationObserver(function() {
            if (!document.body.contains(modal)) {
                window.visualViewport.removeEventListener('resize', adjustForKeyboard);
                window.visualViewport.removeEventListener('scroll', adjustForKeyboard);
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true });
    }

    return modal;
};

App.ui.confirmModal = function(message, onConfirm) {
    var content = '<p style="margin-bottom:16px;">' + App.utils.escapeHtml(message) + '</p>' +
        '<div class="modal-actions" style="display:flex; gap:8px; justify-content:center;">' +
            '<button id="confirm-yes-btn" class="primary-btn">Да</button>' +
            '<button id="confirm-no-btn" class="secondary-btn">Нет</button>' +
        '</div>';
    var modal = App.ui.createModal('Подтверждение', content);
    document.getElementById('confirm-yes-btn').addEventListener('click', function() {
        modal.remove();
        if (typeof onConfirm === 'function') onConfirm();
    });
    document.getElementById('confirm-no-btn').addEventListener('click', function() {
        modal.remove();
    });
};

App.ui.promptModalAsync = function(title, placeholder, isPassword = false) {
    return new Promise(function(resolve) {
        const inputType = isPassword ? 'password' : 'text';
        const content = `
            <input type="${inputType}" id="prompt-input" placeholder="${App.utils.escapeHtml(placeholder || '')}" style="width:100%; margin-bottom:16px;">
            <div class="modal-actions" style="display:flex; gap:8px; justify-content:flex-end;">
                <button id="prompt-ok-btn" class="primary-btn">ОК</button>
                <button id="prompt-cancel-btn" class="secondary-btn">Отмена</button>
            </div>
        `;
        const modal = App.ui.createModal(title, content);
        const input = modal.querySelector('#prompt-input');
        const okBtn = modal.querySelector('#prompt-ok-btn');
        const cancelBtn = modal.querySelector('#prompt-cancel-btn');
        input.focus();
        let resolved = false;
        function cleanup() {
            if (resolved) return;
            resolved = true;
            if (modal && modal.remove) modal.remove();
        }
        const onOk = (e) => {
            if (e) e.stopPropagation();
            if (resolved) return;
            const value = input.value;
            cleanup();
            resolve(value);
        };
        const onCancel = (e) => {
            if (e) e.stopPropagation();
            if (resolved) return;
            cleanup();
            resolve(null);
        };
        okBtn.onclick = onOk;
        cancelBtn.onclick = onCancel;
        // Закрытие через крестик или оверлей
        const originalRemove = modal.remove;
        modal.remove = function() {
            originalRemove.call(modal);
            if (!resolved) {
                resolved = true;
                resolve(null);
            }
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onOk();
            }
        });
    });
};

// Простая Promise-версия promptModal (без подмены createModal)
App.ui.promptModalAsync = function(title, placeholder, isPassword = false) {
    return new Promise(function(resolve) {
        const inputType = isPassword ? 'password' : 'text';
        const content = `
            <input type="${inputType}" id="prompt-input" placeholder="${App.utils.escapeHtml(placeholder || '')}" style="width:100%; margin-bottom:16px;">
            <div class="modal-actions" style="display:flex; gap:8px; justify-content:flex-end;">
                <button id="prompt-ok-btn" class="primary-btn">ОК</button>
                <button id="prompt-cancel-btn" class="secondary-btn">Отмена</button>
            </div>
        `;
        const modal = App.ui.createModal(title, content);
        const input = modal.querySelector('#prompt-input');
        const okBtn = modal.querySelector('#prompt-ok-btn');
        const cancelBtn = modal.querySelector('#prompt-cancel-btn');
        input.focus();
        function cleanup() {
            if (modal && modal.remove) modal.remove();
        }
        okBtn.onclick = () => {
            const value = input.value;
            cleanup();
            resolve(value);
        };
        cancelBtn.onclick = () => {
            cleanup();
            resolve(null);
        };
        // При закрытии через крестик или оверлей
        const originalRemove = modal.remove;
        modal.remove = function() {
            originalRemove.call(modal);
            resolve(null);
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                okBtn.click();
            }
        });
    });
};

// Старая версия promptModal с колбэком (для обратной совместимости)
App.ui.promptModal = function(title, defaultValue, onSubmit) {
    var content = '<input type="text" id="prompt-input" value="' + App.utils.escapeHtml(defaultValue || '') + '" style="margin-bottom:16px;">' +
        '<div class="modal-actions" style="display:flex; gap:8px; justify-content:flex-end;">' +
            '<button id="prompt-ok-btn" class="primary-btn">ОК</button>' +
            '<button id="prompt-cancel-btn" class="secondary-btn">Отмена</button>' +
        '</div>';
    var modal = App.ui.createModal(title, content);
    var input = document.getElementById('prompt-input');
    var okBtn = document.getElementById('prompt-ok-btn');
    var cancelBtn = document.getElementById('prompt-cancel-btn');
    var resolved = false;
    function cleanup() {
        if (modal && modal.parentNode) modal.remove();
    }
    okBtn.onclick = function() {
        if (resolved) return;
        resolved = true;
        var val = input.value;
        cleanup();
        if (typeof onSubmit === 'function') onSubmit(val);
    };
    cancelBtn.onclick = function() {
        if (resolved) return;
        resolved = true;
        cleanup();
        if (typeof onSubmit === 'function') onSubmit(null);
    };
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') okBtn.click();
    });
    modal.addEventListener('click', function(e) {
        if (e.target === modal) cancelBtn.click();
    });
};

App.ui.alertModal = function(message) {
    var content = '<p style="margin-bottom:16px; white-space:pre-wrap;">' + App.utils.escapeHtml(message) + '</p>' +
        '<div class="modal-actions" style="display:flex; gap:8px; justify-content:center;">' +
            '<button id="alert-ok-btn" class="primary-btn">ОК</button>' +
        '</div>';
    var modal = App.ui.createModal('Информация', content);
    document.getElementById('alert-ok-btn').addEventListener('click', function() {
        modal.remove();
    });
};