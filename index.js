const req = require('request-promise');
const Discord = require('discord.js');
const { webhook, skus } = require('./config.json');
const _ = require('lodash');

class Monitor {
	constructor(sku, lastStock, task) {
		this.sku = sku;
		this.lastStock = lastStock;
		this.task = task;

		console.log(`${this.getTime()} Starting task ${this.task}...`);
	}

	async fetchStock() {
		const options = {
			uri: `https://www.yeezysupply.com/api/products/${this.sku}/availability`,
			accept: 'application/json',
			'cache-control': 'max-age=0',
			'accept-encoding': 'gzip, deflate, br',
			headers: {
				method: 'GET',
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.113 Safari/537.36'
			},
			gzip: true,
			simple: false,
			resolveWithFullResponse: true,
			json: true
		};

		try {
			const data = await req(options);

			//if api returns message: not found then we retry in a minute
			if (data.body.message || data.statusCode === 404 || data.body.availability_status === 'PREVIEW') {
				console.log(`${this.getTime()} No Stock Loaded on task ${this.task}`);
				setTimeout(() => {
					return this.fetchStock();
				}, 60000);
				return;
			}

			//pull the variant array from the response
			const { id, variation_list: variants } = data.body;

			const fetchProductInfo = await this.fetchInfo(id);

			//if the current request's json isn't the same as our last request then we check the data
			if (!_.isEqual(variants, this.lastStock)) {
				this.lastStock = variants;
				//find all the sizes that have stock
				const inStock = variants.filter((variant) => variant.availability > 0);
				if (inStock.length !== 0) {
					//the product has changed and if it still has stock we send discord notification
					this.notify(id, inStock, fetchProductInfo);
					//log the stock to the console
					console.log(`${this.getTime()} Task ${this.task} has stock:`);
					inStock.map((stock) => {
						if (stock.availability === 15) {
							console.log(`Size: ${stock.size}, Stock: 15+`);
						} else {
							console.log(`Size: ${stock.size}, Stock: ${size.availability}`);
						}
					});
					setTimeout(() => {
						return this.fetchStock();
					}, 30000);
				} else {
					console.log(`Product has sold out task ${this.task}`);
					return;
				}
			} else {
				console.log(`${this.getTime()} Stock is the same on task ${this.task}`);
				setTimeout(() => {
					return this.fetchStock();
				}, 30000);
			}
		} catch (err) {
			console.log(`Request failed, retrying on task ${this.task}`, err.message);
			setTimeout(() => {
				return this.fetchStock();
			}, 10000);
		}
	}

	async fetchInfo(sku) {
		const options = {
			uri: `https://www.yeezysupply.com/api/products/${sku}`,
			accept: 'application/json',
			'cache-control': 'max-age=0',
			'accept-encoding': 'gzip, deflate, br',
			headers: {
				method: 'GET',
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.113 Safari/537.36'
			},
			gzip: true,
			simple: false,
			resolveWithFullResponse: true,
			json: true
		};

		try {
			const data = await req(options);
			const { name, view_list, pricing_information, attribute_list } = data.body;
			return {
				title: name,
				image: view_list[0].image_url,
				price: pricing_information.standard_price,
				color: attribute_list.color
			};
		} catch (err) {
			console.log(`Unable to fetch product details on task ${this.task}`, err.message);
		}
	}

	getTime() {
		const date = new Date();
		const hours = date.getHours();
		const minutes = date.getMinutes();
		const seconds = date.getSeconds();
		const milliseconds = date.getMilliseconds();
		return `${hours}:${minutes}:${seconds}:${milliseconds}`;
	}

	async notify(id, variants, productInfo) {
		const webhookStrings = webhook.split('/');

		try {
			const webhookClient = new Discord.WebhookClient(webhookStrings[5], webhookStrings[6]);

			const embed = new Discord.MessageEmbed()
				.setTitle(`${productInfo.title} ${productInfo.color}`)
				.setColor('#0099ff')
				.setURL(`https://www.yeezysupply.com/product/${id}`)
				.setAuthor('https://www.yeezysupply.com', '', 'https://www.yeezysupply.com')
				.setThumbnail(productInfo.image ? productInfo.image : null)
				.addField('Price', `$${productInfo.price}`, false)
				.setTimestamp()
				.setFooter('YS Stock Monitor');

			variants.map((variant) => {
				const stock = variant.availability === 15 ? '15+' : variant.availability.toString();
				embed.addField(`${variant.size}`, stock, true);
			});

			await webhookClient.send('', {
				username: 'YS Monitor',
				embeds: [ embed ]
			});

			webhookClient.destroy();
		} catch (err) {
			console.log(`Unable to send Discord Notification on task ${this.task}`, err.message);
		}
	}
}

skus.map((sku, idx) => {
	const monitor = new Monitor(sku, null, idx);
	monitor.fetchStock();
});
