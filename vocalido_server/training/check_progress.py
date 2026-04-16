import os
from tensorboard.backend.event_processing import event_accumulator

def get_last_loss(log_dir):
    for root, dirs, files in os.walk(log_dir):
        for file in files:
            if "events.out.tfevents" in file:
                path = os.path.join(root, file)
                print(f"Reading {path}...")
                ea = event_accumulator.EventAccumulator(path)
                ea.Reload()
                tags = ea.Tags().get('scalars', [])
                for tag in tags:
                    if 'loss' in tag.lower():
                        events = ea.Scalars(tag)
                        if events:
                            print(f"Tag: {tag}, Last Value: {events[-1].value}, Step: {events[-1].step}")

if __name__ == "__main__":
    get_last_loss("/Users/paisan/vocamind-projects/Memolody_V2/vocalido-server/training/DiffSinger/checkpoints/vocalido_v1")
