.PHONY: dev-up dev-rebuild dev-bash dev-down dev-claude

# devcontainer start
dev-up:
	devcontainer up --workspace-folder .

# devcontainer force rebuild
dev-rebuild:
	devcontainer up --workspace-folder . --remove-existing-container --build-no-cache

# devcontainer bash entry
dev-bash:
	devcontainer exec --workspace-folder . bash

# devcontainer stop
dev-down:
	docker stop $$(docker ps -q --filter "label=devcontainer.local_folder=$(PWD)")

# devcontainer run claude
dev-claude:
	devcontainer exec --workspace-folder . claude --dangerously-skip-permissions
