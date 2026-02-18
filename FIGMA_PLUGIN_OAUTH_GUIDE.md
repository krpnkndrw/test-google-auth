# Гайд: адаптация текущей авторизации под Figma-плагин

Документ описывает, что нужно изменить в текущей Google OAuth-авторизации, если фронтендом станет Figma-плагин. Основа — [OAuth with Plugins | Figma Developer Docs](https://developers.figma.com/docs/plugins/oauth-with-plugins/).

---

## Содержание

1. [Почему текущий флоу не подходит](#1-почему-текущий-флоу-не-подходит)
2. [Целевой флоу для плагина](#2-целевой-флоу-для-плагина)
3. [Изменения на бэкенде](#3-изменения-на-бэкенде)
4. [Изменения во фронтенде (Figma-плагин)](#4-изменения-во-фронтенде-figma-плагин)
5. [Безопасность](#5-безопасность)
6. [Чеклист внедрения](#6-чеклист-внедрения)

---

## 1. Почему текущий флоу не подходит

### Текущая схема (веб)

1. Фронт: `POST /auth` → бэкенд возвращает `authUrl` (Google OAuth).
2. Фронт: `window.location.href = authUrl` — полный редирект на Google.
3. Пользователь логинится в Google; Google редиректит на бэкенд `/auth/callback?code=...`.
4. Бэкенд: обмен кода на токены, создание/обновление пользователя, установка JWT в **httpOnly cookie**, редирект на `FRONT_URL`.
5. Пользователь снова на сайте с cookie; запросы к `/me` идут с `credentials: "include"`.

### Ограничения Figma-плагина

- Плагин работает в **Electron** (десктоп) или в iframe в браузере.
- `window.open()` из плагина открывает окно в браузере, у которого **`window.opener === null`** — передать токен обратно через `postMessage` после редиректа нельзя.
- Регистрация кастомной URI-схемы или поднятие локального сервера из плагина недоступны по соображениям безопасности.

**Вывод:** единственный допустимый вариант — ваш сервер на публичном HTTPS: пользователь авторизуется через этот сервер, а результат (токен или код) доставляется плагину через **одноразовые read/write ключи** и **polling**.

---

## 2. Целевой флоу для плагина

1. Плагин проверяет `figma.clientStorage` — есть ли сохранённый токен.
2. Плагин показывает UI через `figma.showUI()` — iframe загружает страницу **на вашем домене** (non-null origin).
3. Если уже авторизован — main-код передаёт токен в iframe через `figma.ui.postMessage` с указанием `origin`.
4. Если нет:
   - Iframe запрашивает у бэкенда пару **read key** и **write key** (одноразовые).
   - Iframe открывает **новое окно** `window.open(url, '_blank')`, где `url` — страница на вашем сервере с **write key** в параметре (например, в `state`).
   - На этой странице сервер **устанавливает cookie** с write key (обязательно при top-level навигации) и редиректит пользователя на Google OAuth с тем же `state`.
   - Пользователь логинится в Google; Google редиректит на ваш `/auth/callback`.
   - В callback сервер **проверяет**: `state` из запроса совпадает с cookie. Затем записывает результат (JWT или код) по **write key** в хранилище.
   - Сервер отдаёт HTML: «Authentication complete. Switch back to Figma».
   - Iframe плагина **поллит** `GET /auth/poll?readKey=...` по HTTPS. Когда значение записано — получает токен и прекращает polling.
5. Iframe передаёт токен в main через `postMessage` (origin `https://www.figma.com`); main сохраняет в `figma.clientStorage.setAsync('my-token', token)`.
6. Дальнейшие запросы к API идут с заголовком `Authorization: Bearer <token>` (cookie для плагина не используются).

---

## 3. Изменения на бэкенде

### 3.1 Хранилище одноразовых ключей

Нужна структура «read key ↔ write key» и по write key — запись результата OAuth (код или JWT). После первого чтения по read key запись удаляется.

**Варианты:**

- **In-memory:** `Map<string, { writeKey: string; value?: string }>` с TTL (например, 5–10 минут) и периодической очисткой.
- **БД/Redis:** таблица или ключ с полями `read_key`, `write_key`, `value`, `created_at`; при чтении — удаление или пометка «использован».

Пример контракта:

- `createKeyPair()` → `{ readKey, writeKey }`, в хранилище: по `readKey` можно прочитать, по `writeKey` можно один раз записать `value`.
- `writeByWriteKey(writeKey, value)` — записать результат.
- `readByReadKey(readKey)` — прочитать и удалить запись; если ещё не записано — вернуть `null`.

### 3.2 Эндпоинт выдачи ключей и URL для входа (плагин)

Новый эндпоинт, например `POST /auth/plugin/keys`:

1. Сгенерировать уникальные `readKey` и `writeKey` (криптостойкие случайные строки).
2. Сохранить в хранилище пару; значение пока пустое.
3. Вернуть клиенту JSON:
   - `readKey` — для последующего polling;
   - `authUrl` — URL **вашей** страницы на том же домене, куда плагин откроет окно, с параметром `state=<writeKey>` (или отдельным параметром).

Пример ответа:

```json
{
  "readKey": "rk_abc123...",
  "authUrl": "https://your-api.com/auth/plugin-start?state=wk_xyz789..."
}
```

Не отдавайте в ответе `writeKey` отдельно — он уже в `authUrl` (в `state`). Плагин не должен отправлять write key на сервер в явном виде; он только открывает этот URL в браузере.

### 3.3 Страница «старт OAuth» (interstitial)

Новая страница, например `GET /auth/plugin-start`:

- Query-параметр: `state` (= write key).
- Установить **cookie** на ваш домен с этим значением (например, `oauth_write_key=...`, SameSite=Lax, HttpOnly, Secure в production).
  Cookie должна выставляться при **top-level** навигации (когда пользователь попадает сюда из `window.open`), иначе браузер может блокировать third-party cookies.
- Отдать HTML с кнопкой «Link account» / «Continue», по нажатию — редирект на Google OAuth:
  - `redirect_uri` — ваш `https://your-api.com/auth/callback` (для плагина можно тот же или отдельный path, например `.../auth/plugin-callback`);
  - `state` — тот же write key (передать дальше в Google и получить обратно в callback).

Важно: без установки cookie на этом шаге вы не сможете в callback надёжно проверить, что запрос пришёл от того же «сеанса», а не подставлен другим плагином.

### 3.4 Callback для плагина

Текущий `GET /auth/callback` делает: обмен кода на токены → пользователь в БД → JWT в cookie → редирект на `FRONT_URL`.

Для плагина нужна отдельная ветка (или отдельный путь, например `GET /auth/plugin-callback`):

1. Получить из query `state` (write key) и `code`.
2. **Проверка:** значение `state` должно **совпадать** с тем, что лежит в cookie (например, `oauth_write_key`). Если нет — ответ 400, запрос не обрабатывать.
3. Обменять `code` на токены Google, создать/обновить пользователя, сгенерировать JWT (как сейчас).
4. **Вместо** установки cookie и редиректа:
   - Записать в хранилище по **write key** значение (например, JWT): `writeByWriteKey(state, JSON.stringify({ token }))`.
   - Отдать HTML: «Authentication complete. You can close this window and switch back to Figma.» Без редиректа на Figma (его нет в белом списке).
5. Токен не хранить на сервере дольше, чем до первого чтения по read key.

Если используете один и тот же `/auth/callback`, различать «веб» и «плагин» можно по наличию cookie с write key или по отдельному query-параметру `client=plugin`.

### 3.5 Эндпоинт polling

Новый эндпоинт: `GET /auth/poll?readKey=...`

- Проверять **Origin** запроса: разрешать только ваш зарегистрированный домен (тот, с которого грузится iframe плагина). Иначе другой плагин может подставить свой read key и украсть ответ.
- По `readKey` вызвать `readByReadKey(readKey)`: если значение ещё не записано — ответ `204 No Content` или `404`; если записано — вернуть тело, например `{ "token": "jwt..." }`, и **удалить** запись (одноразовое чтение).
- По гайду Figma запросы к этому эндпоинту должны идти **только по HTTPS**.

Формат ответа при успехе можно согласовать с плагином (например, обёртка `{ "token": "...", "user": { "id", "email" } }`).

### 3.6 Поддержка токена в заголовке (requireAuth)

Сейчас `requireAuth` читает JWT только из `req.cookies.token`. Для плагина токен приходит в заголовке:

- `Authorization: Bearer <token>`

Нужно в `requireAuth` (или в отдельном middleware):

- Сначала проверить `Authorization: Bearer ...`, если есть — использовать этот токен;
- Иначе — как сейчас, `req.cookies.token`.

Тогда один и тот же бэкенд обслуживает и веб (cookie), и плагин (Bearer).

### 3.7 CORS

Для iframe плагина и для `/auth/poll` явно разрешить только ваш origin (URL страницы, которую грузит плагин). Текущая настройка `origin: process.env.FRONT_URL` может быть расширена, например:

- `FRONT_URL` — веб-приложение;
- `PLUGIN_ORIGIN` или тот же домен, что и API — страница плагина.

Убедиться, что на `/auth/poll` и на страницу плагина запросы с этого origin проходят, с остальных — блокируются.

### 3.8 Логаут для плагина

Для веба логаут — `POST /logout` и очистка cookie. Для плагина токен хранится в `figma.clientStorage`; при логауте плагин:

- Вызывает тот же `POST /logout` (опционально, если хотите инвалидировать сессию на сервере);
- Удаляет токен локально: `figma.clientStorage.deleteAsync('my-token')`.

Отдельный эндпоинт для плагина не обязателен, если JWT stateless и вы не храните активные сессии на бэкенде.

---

## 4. Изменения во фронтенде (Figma-плагин)

### 4.1 Два entry point

- **main** — код в песочнице Figma (нет доступа к `window`, есть `figma.clientStorage`, `figma.ui.postMessage`).
- **ui** — iframe с HTML/JS; здесь доступны браузерные API и сетевые запросы.

Текущий React-фронт логично перенести в **ui** (или его часть). В `manifest.json` указать оба: `"main"`, `"ui"`.

### 4.2 Загрузка iframe с вашего домена

В `figma.showUI()` указать URL страницы на **вашем сервере**, например `https://your-domain.com/plugin`. Тогда iframe имеет ваш origin и может безопасно общаться с API и получать сообщения от main с проверкой origin.

### 4.3 Логика «Sign in» в iframe

Вместо «POST /auth → window.location.href = authUrl»:

1. Запрос к новому эндпоинту (например, `POST /auth/plugin/keys`) → в ответе `readKey` и `authUrl`.
2. Сохранить `readKey` в переменной в iframe.
3. Открыть новое окно: `window.open(authUrl, '_blank')`. В `authUrl` уже подставлен `state=writeKey` (страница `/auth/plugin-start`).
4. Запустить **polling**: раз в 1–2 секунды `GET /auth/poll?readKey=...` (HTTPS). Когда статус 200 и в теле есть токен — остановить polling, закрыть или не трогать окно (пользователь может закрыть сам).
5. Полученный токен отправить в main (см. ниже) и сохранить в `figma.clientStorage`.

### 4.4 Передача токена в main и хранение

- Из iframe в main: `parent.postMessage({ pluginMessage: { type: 'saveToken', token: token } }, 'https://www.figma.com')`. По гайду нужно передавать `pluginId` и ограничивать audience (origin `https://www.figma.com`).
- В main: в обработчике `onmessage` при `msg.type === 'saveToken'` вызвать `figma.clientStorage.setAsync('my-token', msg.token)`.
- При следующем запуске плагина: main читает `figma.clientStorage.getAsync('my-token')` и при открытии UI передаёт токен в iframe через `figma.ui.postMessage({ type: 'token', token }, { origin: 'https://your-domain.com' })`.
  Так iframe не делает лишний запрос на логин и может вызывать `/me` с `Authorization: Bearer <token>`.

### 4.5 Вызовы API (/me и др.)

- Запросы выполняются из **iframe** (из main в плагинах Figma сетевые запросы к произвольным URL недоступны).
- В каждый запрос добавлять заголовок: `Authorization: Bearer <token>`.
- Токен брать из памяти (после получения по polling) или из сообщения от main (при загрузке UI с уже сохранённым токеном).

### 4.6 Логаут в плагине

- Удалить токен: в main по сообщению от UI выполнить `figma.clientStorage.deleteAsync('my-token')`.
- Опционально вызвать `POST /logout` с iframe (если бэкенд поддерживает инвалидацию; при stateless JWT достаточно удаления на клиенте).

---

## 5. Безопасность

- **state = write key:** всегда передаётся в OAuth `state` и проверяется в callback против cookie. Защита от подмены callback.
- **Cookie с write key** выставляется только при top-level навигации на вашу страницу (`/auth/plugin-start`), не из iframe.
- **Polling** — только по HTTPS; ответ по read key отдаётся только при совпадении Origin с вашим доменом.
- **Токен в плагине:** при передаче из iframe в main — только на origin `https://www.figma.com` и с указанием `pluginId`, чтобы другой код не мог выдать себя за Figma.
- Рекомендация Figma: по возможности использовать **PKCE** и отдавать плагину **authorization code**, а не access token; плагин сам обменивает код на токен. Тогда токен не передаётся через ваш сервер.
  В текущей схеме обмен кода делает бэкенд; при переходе на PKCE для плагина потребуется либо обмен на стороне плагина (если Google и настройки клиента это позволяют), либо отдельный защищённый эндпоинт с строгой привязкой к read key и одноразовым использованием кода.

---

## 6. Чеклист внедрения

### Бэкенд

- [ ] Реализовать хранилище одноразовых ключей (read/write) с TTL и однократным чтением.
- [ ] Добавить `POST /auth/plugin/keys` (возврат `readKey` и `authUrl` с `state=writeKey`).
- [ ] Добавить страницу `GET /auth/plugin-start?state=...`: установка cookie, кнопка/редирект на Google OAuth.
- [ ] В callback для плагина: проверка `state` === cookie, запись результата по write key, ответ HTML «switch back to Figma».
- [ ] Добавить `GET /auth/poll?readKey=...` с проверкой Origin и HTTPS.
- [ ] В `requireAuth`: поддержка токена из заголовка `Authorization: Bearer <token>`.
- [ ] Настроить CORS для origin страницы плагина.

### Плагин (frontend)

- [ ] Разделить код на main и ui; ui загружается с вашего домена.
- [ ] В ui: запрос ключей, `window.open(authUrl)`, polling по read key.
- [ ] Передача токена из ui в main через `postMessage` с origin `https://www.figma.com` и `pluginId`.
- [ ] Сохранение токена в main: `figma.clientStorage.setAsync('my-token', token)`.
- [ ] При открытии плагина: чтение токена из clientStorage и передача в ui при необходимости.
- [ ] Все запросы к API с заголовком `Authorization: Bearer <token>`.
- [ ] Логаут: удаление токена из clientStorage, при необходимости вызов `POST /logout`.

### Общее

- [ ] Проверить флоу в браузере и в десктопном приложении Figma (оба сценария по гайду).
- [ ] Убедиться, что токен и код не остаются на сервере дольше необходимого (одноразовое чтение по read key, удаление записи).

---

Ссылки:

- [OAuth with Plugins | Figma Developer Docs](https://developers.figma.com/docs/plugins/oauth-with-plugins/)
- [Creating a User Interface (Figma)](https://developers.figma.com/docs/plugins/creating-a-user-interface/) — про обмен сообщениями main ↔ ui.
