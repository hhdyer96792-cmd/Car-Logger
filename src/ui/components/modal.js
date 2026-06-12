// src/ui/components/modal.js
window.App = window.App || {};
App.ui = App.ui || {};

// Функция для закрытия drawer при открытии модалки
function closeDrawerIfOpen() {
    var drawer = document.getElementById('drawer-menu');
    if (drawer && !drawer.classList.contains('hidden')) {
        if (typeof App.events !== 'undefined' && App.events && typeof App.events.closeDrawer === 'function') {
            App.events.closeDrawer();
        } else {
            drawer.classList.add('hidden');
            document.body.classList.remove('drawer-open');
        }
    }
}

App.ui.createModal = function(title, content) {
    // Закрываем drawer при открытии модалки
    closeDrawerIfOpen();
    
    if (App.ui.currentModal) {
        App.ui.currentModal.remove();
        document.body.style.overflow = '';
        document.body.classList.remove('auth-modal-open');
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
    var modalRef = modal;
    
    modal.remove = function() {
        document.body.style.overflow = '';
        document.body.classList.remove('auth-modal-open');
        
        // Убираем возможные блокировки pointer-events
        var fabMenu = document.getElementById('fab-menu');
        if (fabMenu) {
            fabMenu.style.pointerEvents = '';
        }
        
        // Восстанавливаем drawer, если он был скрыт (но не открываем его автоматически)
        // Просто снимаем блокировки, drawer остаётся закрытым
        
        // Убираем блокировку скролла на body
        document.body.style.overflow = '';
        
        if (App.ui.currentModal === modalRef) {
            App.ui.currentModal = null;
        }
        
        // Пересоздаём обработчики навигации, чтобы восстановить кнопку "Ещё"
        if (typeof App.events !== 'undefined' && App.events && typeof App.events.initNavigation === 'function') {
            setTimeout(function() {
                App.events.initNavigation();
            }, 50);
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

    // Адаптация для мобильных устройств (клавиатура)
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
    var yesBtn = document.getElementById('confirm-yes-btn');
    var noBtn = document.getElementById('confirm-no-btn');
    
    if (yesBtn) {
        yesBtn.addEventListener('click', function() {
            modal.remove();
            if (typeof onConfirm === 'function') onConfirm();
        });
    }
    if (noBtn) {
        noBtn.addEventListener('click', function() {
            modal.remove();
        });
    }
};

App.ui.confirmModalAsync = function(message) {
    return new Promise(function(resolve) {
        var content = '<p style="margin-bottom:16px;">' + App.utils.escapeHtml(message) + '</p>' +
            '<div class="modal-actions" style="display:flex; gap:8px; justify-content:center;">' +
                '<button id="confirm-yes-btn" class="primary-btn">Да</button>' +
                '<button id="confirm-no-btn" class="secondary-btn">Нет</button>' +
            '</div>';
        var modal = App.ui.createModal('Подтверждение', content);
        var yesBtn = modal.querySelector('#confirm-yes-btn');
        var noBtn = modal.querySelector('#confirm-no-btn');
        var resolved = false;

        function cleanup() {
            if (!modal.parentNode) return;
            modal.remove();
        }
        
        function onResult(result) {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(result);
        }
        
        if (yesBtn) {
            yesBtn.onclick = function() { onResult(true); };
        }
        if (noBtn) {
            noBtn.onclick = function() { onResult(false); };
        }
        
        var originalRemove = modal.remove;
        modal.remove = function() {
            originalRemove.call(modal);
            onResult(false);
        };
    });
};

App.ui.promptModalAsync = function(title, placeholder, isPassword = false) {
    return new Promise(function(resolve) {
        const inputType = isPassword ? 'password' : 'text';
        const hint = isPassword ? '<p class="hint" style="font-size:0.75rem; margin-top:-8px; margin-bottom:8px;">Рекомендуемая длина: не менее 8 символов</p>' : '';
        const content = `
            <input type="${inputType}" id="prompt-input" placeholder="${App.utils.escapeHtml(placeholder || '')}" style="width:100%; margin-bottom:16px;">
            ${hint}
            <div class="modal-actions" style="display:flex; gap:8px; justify-content:flex-end;">
                <button id="prompt-ok-btn" class="primary-btn">ОК</button>
                <button id="prompt-cancel-btn" class="secondary-btn">Отмена</button>
            </div>
        `;
        const modal = App.ui.createModal(title, content);
        const input = modal.querySelector('#prompt-input');
        const okBtn = modal.querySelector('#prompt-ok-btn');
        const cancelBtn = modal.querySelector('#prompt-cancel-btn');
        
        if (input) input.focus();
        let resolved = false;
        
        function cleanup() {
            if (resolved) return;
            resolved = true;
            if (modal && modal.remove) modal.remove();
        }
        
        const onOk = (e) => {
            if (e) e.stopPropagation();
            if (resolved) return;
            const value = input ? input.value : null;
            cleanup();
            resolve(value);
        };
        
        const onCancel = (e) => {
            if (e) e.stopPropagation();
            if (resolved) return;
            cleanup();
            resolve(null);
        };
        
        if (okBtn) okBtn.onclick = onOk;
        if (cancelBtn) cancelBtn.onclick = onCancel;
        
        const originalRemove = modal.remove;
        modal.remove = function() {
            originalRemove.call(modal);
            if (!resolved) {
                resolved = true;
                resolve(null);
            }
        };
        
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    onOk();
                }
            });
        }
    });
};

// Старая версия promptModal (с колбэком) для обратной совместимости
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
    
    if (okBtn) {
        okBtn.onclick = function() {
            if (resolved) return;
            resolved = true;
            var val = input ? input.value : null;
            cleanup();
            if (typeof onSubmit === 'function') onSubmit(val);
        };
    }
    if (cancelBtn) {
        cancelBtn.onclick = function() {
            if (resolved) return;
            resolved = true;
            cleanup();
            if (typeof onSubmit === 'function') onSubmit(null);
        };
    }
    if (input) {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && okBtn) okBtn.click();
        });
    }
    modal.addEventListener('click', function(e) {
        if (e.target === modal && cancelBtn) cancelBtn.click();
    });
};

App.ui.alertModal = function(message) {
    var content = '<p style="margin-bottom:16px; white-space:pre-wrap;">' + App.utils.escapeHtml(message) + '</p>' +
        '<div class="modal-actions" style="display:flex; gap:8px; justify-content:center;">' +
            '<button id="alert-ok-btn" class="primary-btn">ОК</button>' +
        '</div>';
    var modal = App.ui.createModal('Информация', content);
    var okBtn = document.getElementById('alert-ok-btn');
    if (okBtn) {
        okBtn.addEventListener('click', function() {
            modal.remove();
        });
    }
};