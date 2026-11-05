'use strict';

const SCENE = '8bf9bb34-2054-4a9a-baf8-d8a02ec69196';

exports.load = function () {
    let tries = 0;
    const timer = setInterval(() => {
        tries += 1;
        Editor.Message.request('scene', 'open-scene', SCENE).then(() => {
            clearInterval(timer);
        }).catch(() => {
            if (tries >= 20) clearInterval(timer);
        });
    }, 2000);
};

exports.unload = function () {};
