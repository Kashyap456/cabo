build_prod:
	cd frontend && npm run build | cd ..
	tar -czf dist.tgz -C frontend/dist .
	scp dist.tgz root@pirates_droplet:/tmp/dist.tgz
	ssh root@pirates_droplet 'REL=/var/www/cabo/releases/$$(date +%Y%m%d-%H%M%S) && \
		sudo mkdir -p "$$REL" && \
		sudo tar -xzf /tmp/dist.tgz -C "$$REL" && \
		sudo ln -sfn "$$REL" /var/www/cabo/current && \
		sudo nginx -t && sudo systemctl reload nginx'