/*
# 京东比价(网页版)
# 适用于小火箭、QX等
# 点击商品详情页，详情页图片加载会触发脚本

[Script]
京东比价 = type=http-response,pattern=^https:\/\/in\.m\.jd\.com\/product\/graphext\/\d+\.html,requires-body=1,script-path=https://raw.githubusercontent.com/example/jd_price.js

[MITM]
hostname = in.m.jd.com
*/

const $ = new Env('京东比价');
const url = $request.url;
const regex = /product\/graphext\/(\d+)\.html/;
const match = url.match(regex);
const shareUrl = `https://item.m.jd.com/product/${match[1]}.html`;

request_history_price(shareUrl)
    .then(data => {
        if (data?.ok === 1 && data?.single) {
            const priceHTML = generatePriceHTML(data);
            modifyResponse(priceHTML);
        } else {
            $done({});
        }
    })
    .catch(() => $done({}));

function generatePriceHTML(data) {
    const themeCSS = `
        :root {
            --bg-color: #fff;
            --text-color: #333;
            --border-color: #e5e5e5;
            --header-bg: #f8f8f8;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bg-color: #1a1a1a;
                --text-color: #e0e0e0;
                --border-color: #2d2d2d;
                --header-bg: #2a2a2a;
            }
        }
    `;

    const styles = `
        <style>
            ${themeCSS}
            .price-container {
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                padding: 12px;
                background: var(--bg-color);
                color: var(--text-color);
            }
            .price-header {
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 12px;
                color: var(--text-color);
            }
            .price-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 12px;
                background: var(--bg-color);
                border-radius: 8px;
                overflow: hidden;
            }
            .price-table th, .price-table td {
                padding: 10px;
                text-align: left;
                border: 1px solid var(--border-color);
            }
            .price-table th {
                background: var(--header-bg);
                font-weight: 500;
            }
            .price-up { color: #ff4d4f; }
            .price-down { color: #52c41a; }
            .price-tip {
                font-size: 12px;
                color: #999;
                margin-top: 8px;
            }
        </style>
    `;

    const priceHistory = getPriceHistory(data.single);
    const currentPrice = priceHistory[0]?.price || '-';
    
    let tableRows = '';
    priceHistory.forEach(item => {
        const priceClass = getPriceClass(currentPrice, item.price);
        tableRows += `
            <tr>
                <td>${item.name}</td>
                <td>${item.date}</td>
                <td class="${priceClass}">${formatPrice(item.price)}</td>
                <td class="${priceClass}">${item.difference}</td>
            </tr>
        `;
    });

    return `
        ${styles}
        <div class="price-container">
            <div class="price-header">京东价格历史</div>
            <table class="price-table">
                <tr>
                    <th>时间段</th>
                    <th>日期</th>
                    <th>价格</th>
                    <th>变化</th>
                </tr>
                ${tableRows}
            </table>
            <div class="price-tip">${data.PriceRemark.Tip}（仅供参考）</div>
        </div>
    `;
}

function getPriceHistory(single) {
    const singleArray = JSON.parse(`[${single.jiagequshiyh}]`);
    const list = singleArray.reverse().slice(0, 360);
    let currentPrice;

    const periods = [
        { days: 1, name: '当前价格' },
        { days: 30, name: '三十天最低' },
        { days: 90, name: '九十天最低' },
        { days: 180, name: '半年最低' },
        { days: 360, name: '一年最低' }
    ];

    const lowestPrices = periods.map(period => ({
        name: period.name,
        days: period.days,
        price: Infinity,
        date: '',
        difference: '-'
    }));

    list.forEach((item, index) => {
        const [timestamp, price] = item;
        const date = formatDate(timestamp);

        if (index === 0) {
            currentPrice = price;
            lowestPrices[0] = {
                name: '当前价格',
                price,
                date,
                difference: '-'
            };
        }

        lowestPrices.forEach(lowest => {
            if (index < lowest.days && price < lowest.price) {
                lowest.price = price;
                lowest.date = date;
                lowest.difference = calculateDifference(currentPrice, price);
            }
        });
    });

    return lowestPrices;
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatPrice(price) {
    return price === Infinity ? '-' : `¥${parseFloat(price).toFixed(2)}`;
}

function calculateDifference(current, compare) {
    if (current === compare) return '-';
    const diff = current - compare;
    const percentage = ((diff / compare) * 100).toFixed(1);
    return `${diff > 0 ? '↑' : '↓'}${Math.abs(diff).toFixed(2)}(${Math.abs(percentage)}%)`;
}

function getPriceClass(current, compare) {
    if (current === compare) return '';
    return current > compare ? 'price-up' : 'price-down';
}

function request_history_price(share_url) {
    return new Promise((resolve, reject) => {
        const options = {
            url: "https://apapia-history.manmanbuy.com/ChromeWidgetServices/WidgetServices.ashx",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3"
            },
            body: `methodName=getHistoryTrend&p_url=${encodeURIComponent(share_url)}`
        };
        
        $.post(options, (err, resp, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(JSON.parse(data));
            }
        });
    });
}

function modifyResponse(html) {
    let { body } = $response;
    body = body.replace('</body>', `${html}</body>`);
    $done({ body });
}

// Env函数省略，使用原有的即可
